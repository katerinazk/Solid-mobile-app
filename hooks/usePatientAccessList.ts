import { useState, useEffect, useCallback } from 'react';
import { fetchAccessListForPatient } from '../services/access';
import { useAuth } from './useAuth';
import { compareGreekNames } from '../utils/recordSearch';
import { friendlyErrorMessage } from '../utils/networkError';

export function usePatientAccessList() {
  const { loggedInPatientAmka } = useAuth();
  const [accessList, setAccessList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // Κρατάμε το σφάλμα ώστε η οθόνη να ξεχωρίζει το "απέτυχε η φόρτωση" από το "δεν έχετε
  // δώσει πρόσβαση σε κανέναν" - πριν κατέληγαν και τα δύο στο ίδιο άδειο μήνυμα.
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await fetchAccessListForPatient(loggedInPatientAmka);
      if (fetchError) {
        console.error(fetchError);
        setError(friendlyErrorMessage(fetchError, "Αποτυχία φόρτωσης προσβάσεων."));
        return;
      }

      // Αλφαβητικά κατά επίθετο, όπως και οι ασθενείς στην οθόνη του γιατρού. Η λίστα
      // ξαναδιαβάζεται από εδώ μετά από κάθε νέα πρόσβαση, οπότε μένει ταξινομημένη.
      const sorted = [...(data || [])].sort((a: any, b: any) => compareGreekNames(
        `${a.doctors?.last_name || ''} ${a.doctors?.first_name || ''}`,
        `${b.doctors?.last_name || ''} ${b.doctors?.first_name || ''}`,
      ));
      setAccessList(sorted);
    } catch (err: any) {
      console.error(err);
      setError(friendlyErrorMessage(err, "Αποτυχία φόρτωσης προσβάσεων."));
    } finally {
      setLoading(false);
    }
  }, [loggedInPatientAmka]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { accessList, setAccessList, loading, setLoading, error, refresh };
}
