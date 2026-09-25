import { router } from 'expo-router';
import { ROUTES } from '../constants/routes';
import { useAuth } from './useAuth';
import { fetchAccessEntry } from '../services/access';
import { fetchPatientByAmka } from '../services/patients';
import { getOwnerWebId } from '../services/solidPod';
import { ACCESS_NONE } from '../constants/accessTypes';
import { NotificationLink } from '../services/notifications';
import { showMessage } from '../utils/appMessage';

/**
 * Πού πηγαίνει ο χρήστης όταν πατήσει μια ειδοποίηση: στα αιτήματα πρόσβασης, σε μια εγγραφή
 * του ιστορικού του (ασθενής) ή στις κατηγορίες ιστορικού ενός ασθενή του (γιατρός).
 */
export function useNotificationNavigation() {
  const { role, loggedInDoctorAmka, activePatientFolderUrl } = useAuth();

  return async (link: NotificationLink) => {
    try {
      if (link.type === 'access_requests') {
        // Η παράμετρος αλλάζει σε κάθε πάτημα, ώστε η οθόνη Προσβάσεων να ανοίγει ξανά το παράθυρο
        // αιτημάτων ακόμα κι αν είναι ήδη ανοιχτή από πριν.
        router.push({ pathname: ROUTES.PATIENT_ACCESS, params: { openRequests: String(Date.now()) } });
        return;
      }

      if (link.type === 'record' && role === 'patient') {
        router.push({
          pathname: ROUTES.RECORD_DETAIL,
          params: { url: link.url, category: link.category, webId: getOwnerWebId(activePatientFolderUrl) },
        });
        return;
      }

      if (link.type === 'patient_history' && role === 'doctor') {
        // Ίδιοι έλεγχοι με το "Προβολή Φακέλου" της αρχικής: η πρόσβαση μπορεί να άλλαξε ή να
        // καταργήθηκε από τότε που στάλθηκε η ειδοποίηση.
        const { data: entry, error } = await fetchAccessEntry(link.patientAmka, loggedInDoctorAmka);
        if (error) {
          showMessage('Δεν ήταν δυνατός ο έλεγχος της πρόσβασης. Δοκιμάστε ξανά.');
          return;
        }
        if (!entry || !entry.acl_synced || entry.access_type === ACCESS_NONE) {
          showMessage('Δεν έχετε πλέον πρόσβαση στον φάκελο αυτού του ασθενή.');
          return;
        }

        const { data: patient } = await fetchPatientByAmka(link.patientAmka);
        if (!patient?.web_id) {
          showMessage('Ο ασθενής δεν έχει συνδέσει ακόμη προσωπικό χώρο (Pod), οπότε δεν υπάρχει ιατρικός φάκελος να ανοίξει.');
          return;
        }

        router.push({
          pathname: ROUTES.DOCTOR_MED_HISTORY,
          params: {
            amka: patient.amka,
            firstName: patient.first_name,
            lastName: patient.last_name,
            webId: patient.web_id,
            birthDate: patient.birth_date || '',
            accessType: entry.access_type,
          },
        });
      }
    } catch {
      showMessage('Απρόσμενο σφάλμα.');
    }
  };
}
