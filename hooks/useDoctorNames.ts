import { useCallback, useEffect, useState } from 'react';
import { DoctorInfo, ensureDoctors, getDoctor, subscribeDoctors } from '../utils/doctorCache';

export type { DoctorInfo };

// Λεπτό περίβλημα πάνω από την κοινή μνήμη ονομάτων ([[utils/doctorCache]]). Η μνήμη είναι
// σκόπιμα ΕΞΩ από το component: αλλιώς κάθε άνοιγμα οθόνης ξανάρχιζε από το μηδέν και το
// όνομα του γιατρού τρεμόπαιζε, εμφανιζόμενο πρώτα στην παλιά αποθηκευμένη μορφή του.
//
// Το hook κάνει μόνο δύο πράγματα: ζητά ό,τι λείπει, και ξαναζωγραφίζει την οθόνη όταν
// έρθει απάντηση για οποιονδήποτε γιατρό.
export function useDoctorNames() {
  const [, setVersion] = useState(0);

  useEffect(() => subscribeDoctors(() => setVersion((v) => v + 1)), []);

  const ensureDoctorInfo = useCallback((amkas: (string | undefined | null)[]) => {
    ensureDoctors(amkas);
  }, []);

  const getDoctorInfo = useCallback((amka?: string | null) => getDoctor(amka), []);

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
