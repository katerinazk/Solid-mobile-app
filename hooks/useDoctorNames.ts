import { useRef, useState, useCallback } from 'react';
import { fetchDoctorByAmka } from '../services/doctors';

export interface DoctorInfo {
  first_name: string;
  last_name: string;
  specialty: string | null;
}

// Cache με τα τρέχοντα στοιχεία των γιατρών (ΑΜΚΑ -> στοιχεία). Κάθε καταχώρηση ιστορικού
// αποθηκεύει στο Pod ένα "στιγμιότυπο" του ονόματος/ειδικότητας του γιατρού τη στιγμή που
// έγινε (doctorName), το οποίο δεν αλλάζει ποτέ μόνο του. Αυτό το hook επιτρέπει στις οθόνες
// ιστορικού να δείχνουν αντ' αυτού το ΤΡΕΧΟΝ όνομα/ειδικότητα, ώστε αν ο γιατρός αλλάξει τα
// στοιχεία του στο προφίλ του, οι παλιές καταχωρήσεις να ενημερωθούν αυτόματα παντού.
export function useDoctorNames() {
  const [doctors, setDoctors] = useState<Record<string, DoctorInfo | null>>({});
  const pendingRef = useRef<Set<string>>(new Set());
  const knownRef = useRef<Set<string>>(new Set());

  const ensureDoctorInfo = useCallback((amkas: (string | undefined | null)[]) => {
    const toFetch = Array.from(new Set(amkas.filter((a): a is string => !!a)))
      .filter((amka) => !knownRef.current.has(amka) && !pendingRef.current.has(amka));

    if (toFetch.length === 0) return;
    toFetch.forEach((amka) => pendingRef.current.add(amka));

    toFetch.forEach(async (amka) => {
      let info: DoctorInfo | null = null;
      try {
        const { data } = await fetchDoctorByAmka(amka);
        if (data) info = { first_name: data.first_name, last_name: data.last_name, specialty: data.specialty };
      } catch {
        // Αν αποτύχει η αναζήτηση, θα συνεχίσει να φαίνεται το αποθηκευμένο στιγμιότυπο (fallback).
      }
      knownRef.current.add(amka);
      pendingRef.current.delete(amka);
      setDoctors((prev) => ({ ...prev, [amka]: info }));
    });
  }, []);

  const getDoctorInfo = useCallback((amka?: string | null) => (amka ? doctors[amka] : undefined), [doctors]);

  return { ensureDoctorInfo, getDoctorInfo };
}

// Μορφή "Δρ. Επίθετο Όνομα (Ειδικότητα)" - χρησιμοποιείται στις περισσότερες κατηγορίες ιστορικού.
export function formatDoctorName(info: DoctorInfo): string {
  return `Δρ. ${info.last_name} ${info.first_name}${info.specialty ? ` (${info.specialty})` : ''}`;
}

// Μορφή "Δρ. Επίθετο" μόνο - χρησιμοποιείται στις Διαγνώσεις, που ήδη απoθήκευαν έτσι.
export function formatDoctorLastNameOnly(info: DoctorInfo): string {
  return `Δρ. ${info.last_name}`;
}
