// Οι ημερομηνίες ταξιδεύουν παντού ως 'ΕΕΕΕ-ΜΜ-ΗΗ': έτσι αποθηκεύονται στο Pod και έτσι
// συγκρίνονται σωστά ακόμα και σαν σκέτο κείμενο.

// Δεν χρησιμοποιούμε new Date('2000-03-10'): αυτό διαβάζεται ως μεσάνυχτα UTC, οπότε σε ζώνη
// πίσω από το UTC γυρίζει η προηγούμενη μέρα. Χτίζουμε την ημερομηνία από τα κομμάτια της.
export function isoToDate(iso?: string): Date | null {
  if (!iso) return null;

  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

export function dateToIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Ελέγχει μια ημερομηνία που αφορά γεγονός του παρελθόντος (νοσηλία, εμβολιασμός). Επιστρέφει
// μήνυμα λάθους ή null. Δεν βάζουμε όριο δεκαετίας: το ιστορικό ενός ασθενή πιάνει ολόκληρη
// τη ζωή του - παιδικά εμβόλια, νοσηλίες δεκαετιών πριν.
export function validatePastDate(iso: string, label: string): string | null {
  const date = isoToDate(iso);
  if (!date) return `Παρακαλώ επιλέξτε ${label}.`;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return `${label}: η ημερομηνία δεν μπορεί να είναι στο μέλλον.`;

  if (date.getFullYear() < 1900) return `${label}: το έτος πρέπει να είναι από το 1900 και μετά.`;

  return null;
}
