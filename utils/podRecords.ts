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

// Το αντίστροφο του newRecordFileName: βγάζει από το όνομα του αρχείου τη στιγμή που γράφτηκε.
//
// Τα ονόματα έχουν τρεις μορφές, από διαφορετικές εποχές της εφαρμογής:
//   1757000000000.json                 - παλιά, σκέτη σήμανση
//   1757000000000_ab12cd34.json        - με τυχαία κατάληξη, κατά της σύγκρουσης στο ίδιο χιλιοστό
//   adult_1757000000000_ab12cd34.json  - διαγνώσεις, με πρόθεμα κατηγορίας
//
// Γι' αυτό ψάχνουμε τη σήμανση μέσα στο όνομα αντί να μετατρέπουμε ολόκληρο το όνομα σε αριθμό.
// Το πρόσημο γίνεται δεκτό, επειδή μια ιατρική ημερομηνία πριν το 1970 δίνει αρνητικά χιλιοστά.
//
// Όταν δεν υπάρχει σήμανση επιστρέφεται -Infinity και όχι 0: το 0 είναι πλέον έγκυρη τιμή, η
// 1η Ιανουαρίου 1970, και δεν πρέπει να μπερδεύεται με το άγνωστο. Έτσι τα αρχεία χωρίς
// σήμανση ταξινομούνται πάντα τελευταία.
export function createdAtFromUrl(url: string): number {
  const name = url.split('/').pop() || '';
  const match = name.match(/(-?\d{13})/);
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
}

/**
 * Χρόνος από πεδίο ημερομηνίας εγγραφής. Επιστρέφει -Infinity όταν το πεδίο λείπει ή δεν
 * διαβάζεται, ώστε το άγνωστο να ξεχωρίζει από την 1η Ιανουαρίου 1970.
 */
export function timeOf(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Συγκριτής "πιο πρόσφατο πρώτα", με τις άγνωστες ημερομηνίες πάντα στο τέλος.
 *
 * Χρειάζεται ξεχωριστή συνάρτηση επειδή η αφαίρεση δύο -Infinity δίνει NaN, που αφήνει τη
 * σειρά απροσδιόριστη: δύο εγγραφές χωρίς ημερομηνία θα άλλαζαν θέση σε κάθε ταξινόμηση.
 */
export function compareNewestFirst(aTime: number, bTime: number): number {
  const aKnown = Number.isFinite(aTime);
  const bKnown = Number.isFinite(bTime);
  if (!aKnown && !bKnown) return 0;
  if (!aKnown) return 1;
  if (!bKnown) return -1;
  return bTime - aTime;
}
