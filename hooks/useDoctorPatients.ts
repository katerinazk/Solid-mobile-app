import { useState, useEffect, useCallback } from 'react';
import { Patient } from '../types/Patient';
import { fetchPatientsForDoctor } from '../services/patients';
import { useAuth } from './useAuth';

export function useDoctorPatients() {
  const { loggedInDoctorAmka } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  // Κρατάμε το σφάλμα ώστε η οθόνη να ξεχωρίζει το "απέτυχε η φόρτωση" από το "δεν έχεις
  // καμία πρόσβαση" - πριν κατέληγαν και τα δύο στο ίδιο άδειο μήνυμα.
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPatientsForDoctor(loggedInDoctorAmka);
      setPatients(data);
    } catch (err: any) {
      console.error("Σφάλμα:", err);
      setError(err?.message || "Άγνωστο σφάλμα.");
    } finally {
      setLoading(false);
    }
  }, [loggedInDoctorAmka]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { patients, loading, error, refresh };
}
