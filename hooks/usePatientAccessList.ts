import { useState, useEffect, useCallback } from 'react';
import { fetchAccessListForPatient } from '../services/access';
import { useAuth } from './useAuth';
import { compareGreekNames } from '../utils/recordSearch';

export function usePatientAccessList() {
  const { loggedInPatientAmka } = useAuth();
  const [accessList, setAccessList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchAccessListForPatient(loggedInPatientAmka);
      if (error) { console.error(error); return; }

      // Αλφαβητικά κατά επίθετο, όπως και οι ασθενείς στην οθόνη του γιατρού. Η λίστα
      // ξαναδιαβάζεται από εδώ μετά από κάθε νέα πρόσβαση, οπότε μένει ταξινομημένη.
      const sorted = [...(data || [])].sort((a: any, b: any) => compareGreekNames(
        `${a.doctors?.last_name || ''} ${a.doctors?.first_name || ''}`,
        `${b.doctors?.last_name || ''} ${b.doctors?.first_name || ''}`,
      ));
      setAccessList(sorted);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [loggedInPatientAmka]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { accessList, setAccessList, loading, setLoading, refresh };
}
