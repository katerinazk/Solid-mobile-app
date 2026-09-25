import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '../constants/routes';
import { fetchAccessEntry } from '../services/access';
import { fetchPatientByAmka } from '../services/patients';
import { accessUnavailableMessage } from '../services/accessMessages';
import { patientSubject } from '../services/notifications';
import { ACCESS_READ_ONLY } from '../constants/accessTypes';
import { useAuth } from './useAuth';
import { showMessage } from '../utils/appMessage';

// Κάθε πόσο ξαναρωτάμε τη βάση όσο ο γιατρός έχει ανοιχτή μια οθόνη του φακέλου.
const POLL_INTERVAL_MS = 15000;

// Ο τύπος πρόσβασης έρχεται σαν παράμετρος πλοήγησης, δηλαδή είναι "φωτογραφία" της στιγμής
// που πατήθηκε το "Προβολή Φακέλου". Ο ασθενής όμως μπορεί να καταργήσει ή να αλλάξει την
// πρόσβαση όσο ο γιατρός βρίσκεται μέσα - και η δική του απόφαση υπερισχύει πάντα. Αυτός ο
// φύλακας ξαναρωτάει τη βάση σε κάθε εστίαση της οθόνης, ανά τακτά διαστήματα, και πριν από
// κάθε εγγραφή (checkAccess), ώστε να μη γράφεται τίποτα με δικαίωμα που δεν ισχύει πια.
export function useDoctorAccessGuard(patientAmka: string, initialAccessType: string) {
  const { role, loggedInDoctorAmka } = useAuth();
  // Το Pod του ασθενή όπως ήταν όταν άνοιξε η οθόνη (όλες οι οθόνες του φακέλου το παίρνουν ως webId).
  const { webId: openedWebId } = useLocalSearchParams<{ webId?: string }>();

  // Τις ίδιες φόρμες τις χρησιμοποιεί και ο ασθενής για τον εαυτό του. Εκεί δεν υπάρχει
  // καταχώρηση πρόσβασης να ελεγχθεί - ο φάκελος είναι δικός του - και ο έλεγχος θα τον
  // πετούσε έξω στην αρχική του γιατρού. Οπότε ο φρουρός απενεργοποιείται.
  const guarded = role === 'doctor';
  const [accessType, setAccessType] = useState(initialAccessType);
  // Κρατάμε και σε ref ώστε η checkAccess να μην αλλάζει ταυτότητα σε κάθε αλλαγή τύπου -
  // αλλιώς το useFocusEffect θα ξανάτρεχε άσκοπα.
  const accessTypeRef = useRef(initialAccessType);
  const kickedOut = useRef(false);

  const checkAccess = useCallback(async (): Promise<boolean> => {
    if (!guarded) return true;
    if (kickedOut.current) return false;

    const { data, error } = await fetchAccessEntry(patientAmka, loggedInDoctorAmka);

    // Σε δικτυακό σφάλμα δεν πετάμε έξω τον γιατρό: δεν ξέρουμε ότι έχασε την πρόσβαση.
    if (error) return true;

    const unavailable = await accessUnavailableMessage(data, patientAmka);
    if (unavailable) {
      kickedOut.current = true;
      showMessage(unavailable);
      router.replace(ROUTES.DOCTOR_HOME);
      return false;
    }
    if (!data) return false;

    // Ο ασθενής μπορεί να άλλαξε Pod και η πρόσβαση να έχει ήδη ξαναγραφτεί στο νέο. Η οθόνη όμως
    // δείχνει ακόμα το παλιό, και μια εγγραφή θα πήγαινε εκεί - όπου ο ασθενής δεν κοιτάζει πια.
    if (openedWebId) {
      const { data: patient, error: patientError } = await fetchPatientByAmka(patientAmka);
      if (!patientError && patient?.web_id && patient.web_id !== openedWebId) {
        kickedOut.current = true;
        showMessage(`${await patientSubject(patientAmka)} αλλάζει Pod αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα.`);
        router.replace(ROUTES.DOCTOR_HOME);
        return false;
      }
    }

    if (data.access_type !== accessTypeRef.current) {
      accessTypeRef.current = data.access_type;
      setAccessType(data.access_type);
      showMessage(`Ο ασθενής άλλαξε τον τύπο πρόσβασης σε "${data.access_type}".`);
      return false;
    }

    return true;
  }, [patientAmka, loggedInDoctorAmka, openedWebId]);

  useFocusEffect(
    useCallback(() => {
      if (!guarded) return;
      checkAccess();
      const timer = setInterval(checkAccess, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [checkAccess, guarded])
  );

  return { accessType, isReadOnly: accessType === ACCESS_READ_ONLY, checkAccess };
}
