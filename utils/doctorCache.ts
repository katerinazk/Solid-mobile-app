import { fetchDoctorByAmka } from '../services/doctors';

export interface DoctorInfo {
  first_name: string;
  last_name: string;
  specialty: string | null;
}

// Κοινή μνήμη με τα ΤΡΕΧΟΝΤΑ στοιχεία των γιατρών (ΑΜΚΑ -> στοιχεία).
//
// Κάθε καταχώρηση ιστορικού αποθηκεύει στο Pod ένα στιγμιότυπο του ονόματος τη στιγμή που
// έγινε, το οποίο δεν αλλάζει ποτέ μόνο του - μπορεί να είναι και σε λατινικά, από παλιότερη
// εποχή της εφαρμογής. Οι οθόνες δείχνουν αντ' αυτού το τρέχον όνομα από τη βάση.
//
// Η μνήμη ΠΡΕΠΕΙ να είναι κοινή και όχι μέσα στο component: όταν ζούσε στην κατάσταση του
// hook, κάθε άνοιγμα οθόνης ξεκινούσε από το μηδέν, εμφάνιζε πρώτα το παλιό αποθηκευμένο
// όνομα και το διόρθωνε μετά. Φαινόταν σαν τρεμόπαιγμα σε κάθε είσοδο, ακόμα και στον ίδιο
// φάκελο.
//
// ΜΟΝΟ στη μνήμη, όπως και οι εγγραφές, και αδειάζει στην αποσύνδεση.

const doctors = new Map<string, DoctorInfo | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

/** undefined = δεν το έχουμε ρωτήσει ακόμα. null = ρωτήθηκε και δεν βρέθηκε. */
export function getDoctor(amka?: string | null): DoctorInfo | null | undefined {
  if (!amka) return undefined;
  return doctors.get(amka);
}

export function subscribeDoctors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ζητά ό,τι δεν υπάρχει ήδη στη μνήμη. Το ίδιο ΑΜΚΑ δεν ζητείται δύο φορές ταυτόχρονα. */
export function ensureDoctors(amkas: (string | undefined | null)[]): void {
  const toFetch = Array.from(new Set(amkas.filter((a): a is string => !!a)))
    .filter((amka) => !doctors.has(amka) && !pending.has(amka));

  if (toFetch.length === 0) return;
  toFetch.forEach((amka) => pending.add(amka));

  toFetch.forEach(async (amka) => {
    let info: DoctorInfo | null = null;
    try {
      const { data } = await fetchDoctorByAmka(amka);
      if (data) info = { first_name: data.first_name, last_name: data.last_name, specialty: data.specialty };
    } catch {
      // Αν αποτύχει, συνεχίζει να φαίνεται το αποθηκευμένο στιγμιότυπο της εγγραφής.
    }
    doctors.set(amka, info);
    pending.delete(amka);
    listeners.forEach((listener) => listener());
  });
}

/** Καλείται στην αποσύνδεση και στην αλλαγή Pod. */
export function clearDoctorCache(): void {
  doctors.clear();
  pending.clear();
}
