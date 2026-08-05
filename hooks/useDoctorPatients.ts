import { useState, useEffect, useCallback } from 'react';
import { Patient } from '../types/Patient';
import { fetchPatientsForDoctor } from '../services/patients';
import { useAuth } from './useAuth';

export function useDoctorPatients() {
  const { loggedInDoctorAmka } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchPatientsForDoctor(loggedInDoctorAmka);
      setPatients(data);
    } catch (error) {
      console.error("Σφάλμα:", error);
    } finally {
      setLoading(false);
    }
  }, [loggedInDoctorAmka]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { patients, loading, refresh };
}
