// Τα πεδία που γράφει η εφαρμογή σε κάθε κατηγορία. Ό,τι δεν τα έχει όλα δεν προέρχεται από
// τη ροή καταχώρησης - είναι είτε αρχείο που πρόσθεσε κάποιος χειροκίνητα στο Pod, είτε παλιά
// εγγραφή από πριν μπουν τα διεθνή πρότυπα.
const REQUIRED_FIELDS: Record<string, string[]> = {
  'Διαγνώσεις': ['code', 'title', 'date', 'category', 'doctorAmka'],
  'Αλλεργίες': ['code', 'title', 'reaction', 'doctorAmka'],
  'Νοσηλίες': ['code', 'title', 'hospitalClinic', 'admissionDate', 'dischargeDate', 'doctorAmka'],
  // Χωρίς startDate: συμπληρώνεται μόνο όταν ο ασθενής πατήσει "Έναρξη". Χωρίς route:
  // το πεδίο μπήκε αργότερα από τους κωδικούς.
  'Φάρμακα': ['code', 'title', 'dosage', 'durationDays', 'doctorAmka'],
  'Εμβολιασμοί': ['code', 'title', 'batchNumber', 'doseNumber', 'administeredDate', 'doctorAmka'],
  // Χωρίς completedDate/resultFile: συμπληρώνονται όταν ο ασθενής ανεβάσει το αποτέλεσμα.
  'Εξετάσεις': ['code', 'title', 'type', 'status', 'doctorAmka'],
};

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * Ελέγχει αν μια εγγραφή του Pod έχει όλα τα πεδία της κατηγορίας της.
 *
 * Το Pod ανήκει στον ασθενή και μπορεί να γράψει ό,τι θέλει μέσα, με οποιοδήποτε εργαλείο.
 * Ένα αρχείο με ελλιπή πεδία εμφανιζόταν σαν μισοάδεια κάρτα, με κενό τίτλο ή ημερομηνία
 * "NaN/NaN/NaN". Πλέον παραλείπεται από τη λίστα.
 */
export function isCompleteRecord(category: string, record: any): boolean {
  if (!record || typeof record !== 'object') return false;

  const required = REQUIRED_FIELDS[category];
  if (!required) return true;

  return required.every((field) => hasValue(record[field]));
}
