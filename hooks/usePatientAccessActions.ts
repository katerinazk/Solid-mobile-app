import { useState } from 'react';
import { useAuth } from './useAuth';
import { updateAccessType, deleteAccess } from '../services/access';
import { updatePodAcl, removeDoctorFromAcl } from '../services/solidPod';
import { ACCESS_NONE } from '../constants/accessTypes';
import { askConfirm, showMessage } from '../utils/appMessage';

/**
 * Οι ενέργειες πάνω σε μία ήδη υπάρχουσα πρόσβαση (αλλαγή τύπου, κατάργηση) - κοινές ανάμεσα
 * στην οθόνη "Προσβάσεις" και στην οθόνη "Προσθήκη Πρόσβασης", αφού και οι δύο μπορούν να
 * δείξουν την κάρτα ενός γιατρού που έχει ήδη πρόσβαση (η δεύτερη, μέσα στα αποτελέσματα
 * αναζήτησης).
 *
 * Παίρνει το accessList/setAccessList/refresh από τον καλούντα αντί να καλεί μόνο του το
 * usePatientAccessList, ώστε κάθε οθόνη να κρατάει τη δική της λίστα.
 */
export function usePatientAccessActions(
  accessList: any[],
  setAccessList: React.Dispatch<React.SetStateAction<any[]>>,
  refresh: () => void,
) {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();

  // Οπτική επιβεβαίωση της αλλαγής: πρώτα δείχνει ότι αποθηκεύεται, μετά ότι ολοκληρώθηκε.
  // Κρατάμε λίστα και όχι έναν γιατρό: αλλάζοντας δεύτερο, η επιβεβαίωση του πρώτου δεν
  // πρέπει να σβήσει, γιατί θα διαβαζόταν σαν να αναιρέθηκε η αλλαγή του.
  const [savingChange, setSavingChange] = useState<{ amka: string; type: string } | null>(null);
  const [savedTypeAmkas, setSavedTypeAmkas] = useState<string[]>([]);
  const resetSavedTypeAmkas = () => setSavedTypeAmkas([]);

  // Ποιος γιατρός καταργείται αυτή τη στιγμή - ώστε το κουμπί "Κατάργηση" να μπλοκάρεται όσο
  // η ενέργεια εκτελείται, χωρίς αυτό ένα δεύτερο πάτημα θα έστελνε διπλό αίτημα κατάργησης.
  const [deletingAmka, setDeletingAmka] = useState<string | null>(null);

  const confirmDialog = (title: string, message: string): Promise<boolean> =>
    askConfirm({ message });

  /**
   * Γράφει τον νέο τύπο στη βάση και ευθυγραμμίζει το ACL του Pod.
   *
   * Το "Καμία Πρόσβαση" βγάζει τον γιατρό από το ACL και κατεβάζει το acl_synced, χωρίς όμως
   * να σβήσει την εγγραφή του: ο ασθενής τον κρατά στη λίστα του για το μέλλον, ενώ ο γιατρός
   * παύει να βλέπει και τον φάκελο και τον ίδιο τον ασθενή στη δική του λίστα.
   */
  const applyAccessType = async (doctorAmka: string, doctorWebId: string | null | undefined, newType: string): Promise<boolean> => {
    const revoking = newType === ACCESS_NONE;

    const { error } = await updateAccessType(loggedInPatientAmka, doctorAmka, newType, revoking ? false : !!doctorWebId);
    if (error) {
      showMessage("Σφάλμα: " + error.message);
      return false;
    }

    // Χωρίς WebID ο γιατρός δεν βρίσκεται καν στο ACL - δεν υπάρχει τίποτα να γραφτεί.
    if (doctorWebId) {
      if (revoking) {
        await removeDoctorFromAcl({ activePatientFolderUrl, accessToken, accessList, doctorWebId });
      } else {
        await updatePodAcl({
          activePatientFolderUrl,
          accessToken,
          accessList,
          newDoctorWebId: doctorWebId,
          accessType: newType,
        });
      }
    }

    return true;
  };

  // Για γιατρό που έχει ΗΔΗ πρόσβαση: ρωτάμε και, αν συμφωνήσει ο ασθενής, αλλάζουμε τον τύπο.
  const confirmChangeAccessType = async (doctorAmka: string, doctorWebId: string | null, newType: string, title: string, message: string): Promise<boolean> => {
    if (!(await confirmDialog(title, message))) return false;
    if (!(await applyAccessType(doctorAmka, doctorWebId, newType))) return false;

    refresh();
    showMessage("Ο τύπος πρόσβασης άλλαξε επιτυχώς!");
    return true;
  };

  const handleSelectAccessType = async (doctorAmka: string, newType: string) => {
    const doctorEntry = accessList.find((a) => a.doctor_amka === doctorAmka);
    if (doctorEntry?.access_type === newType) return;

    setSavingChange({ amka: doctorAmka, type: newType });
    setSavedTypeAmkas((prev) => prev.filter((amka) => amka !== doctorAmka));

    const saved = await applyAccessType(doctorAmka, doctorEntry?.doctors?.web_id, newType);
    setSavingChange(null);
    if (!saved) return;

    setAccessList((prev) => prev.map((a) =>
      a.doctor_amka === doctorAmka ? { ...a, access_type: newType } : a
    ));

    setSavedTypeAmkas((prev) => [...prev, doctorAmka]);
  };

  const handleDeleteAccess = async (doctorAmka: string) => {
    const confirmed = await askConfirm({
      message: "Θέλετε να αφαιρέσετε αυτή την πρόσβαση;",
      confirmText: "Κατάργηση",
      cancelText: "Ακύρωση",
    });
    if (!confirmed) return;
    if (deletingAmka === doctorAmka) return;
    setDeletingAmka(doctorAmka);

    try {
      const doctorEntry = accessList.find((a) => a.doctor_amka === doctorAmka);
      const doctorWebId = doctorEntry?.doctors?.web_id;
      const { error } = await deleteAccess(loggedInPatientAmka, doctorAmka);

      if (!error) {
        if (doctorWebId) {
          await removeDoctorFromAcl({
            activePatientFolderUrl,
            accessToken,
            accessList,
            doctorWebId,
          });
        }
        setAccessList((prev) => prev.filter((a) => a.doctor_amka !== doctorAmka));
        showMessage("Η πρόσβαση καταργήθηκε επιτυχώς!");
      }
    } finally {
      setDeletingAmka(null);
    }
  };

  return {
    savingChange,
    savedTypeAmkas,
    resetSavedTypeAmkas,
    deletingAmka,
    confirmDialog,
    applyAccessType,
    confirmChangeAccessType,
    handleSelectAccessType,
    handleDeleteAccess,
  };
}
