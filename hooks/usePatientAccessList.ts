import { useState, useEffect, useCallback } from 'react';
import { fetchAccessListForPatient } from '../services/access';
import { useAuth } from './useAuth';

export function usePatientAccessList() {
  const { loggedInPatientAmka } = useAuth();
  const [accessList, setAccessList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await fetchAccessListForPatient(loggedInPatientAmka);
      if (error) { console.error(error); return; }
      setAccessList(data || []);
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
