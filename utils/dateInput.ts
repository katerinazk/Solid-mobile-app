// Χτίζει μια ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ ψηφίο-ψηφίο, κρατώντας ημέρα/μήνα/έτος σε ξεχωριστά
// κομμάτια. Αν το πρώτο ψηφίο ημέρας είναι 4-9 (καμία μέρα δεν αρχίζει από 40-99) ή το πρώτο
// ψηφίο μήνα είναι 2-9 (κανένας μήνας δεν αρχίζει από 20-99), συμπληρώνεται αυτόματα με
// μηδενικό και η εισαγωγή προχωράει στο επόμενο κομμάτι - έτσι δεν χρειάζεται ο χρήστης να
// γράφει πάντα δύο ψηφία, χωρίς να μπερδεύονται τα επόμενα ψηφία με λάθος κομμάτι.
export function createDateHandler(
  day: string, setDay: (v: string) => void,
  month: string, setMonth: (v: string) => void,
  year: string, setYear: (v: string) => void,
  currentValue: string
) {
  return (text: string) => {
    const isDeleting = text.length < currentValue.length;

    if (isDeleting) {
      if (year) setYear(year.slice(0, -1));
      else if (month) setMonth(month.slice(0, -1));
      else if (day) setDay(day.slice(0, -1));
      return;
    }

    const newDigit = text.slice(-1);
    if (!/[0-9]/.test(newDigit)) return;

    if (day.length < 2) {
      if (day.length === 1) {
        // Δεύτερο ψηφίο μέρας: αν το πρώτο ήταν "3", οι μόνες έγκυρες μέρες είναι 30 και 31.
        if (day === '3' && newDigit !== '0' && newDigit !== '1') return;
        setDay(day + newDigit);
        return;
      }
      setDay(Number(newDigit) >= 4 ? `0${newDigit}` : newDigit);
      return;
    }
    if (month.length < 2) {
      const next = month + newDigit;
      setMonth(next.length === 1 && Number(next) >= 2 ? `0${next}` : next);
      return;
    }
    if (year.length < 4) {
      setYear(year + newDigit);
    }
  };
}

// Σπάει ένα "ΕΕΕΕ-ΜΜ-ΗΗ" του Pod στα τρία κομμάτια της φόρμας.
export function splitIsoDate(iso?: string): { day: string; month: string; year: string } {
  const [year = '', month = '', day = ''] = (iso || '').split('-');
  return { day, month, year };
}

// Ελέγχει μια ημερομηνία που αφορά γεγονός του παρελθόντος (νοσηλία, εμβολιασμός). Επιστρέφει
// μήνυμα λάθους ή null. Δεν βάζουμε όριο δεκαετίας: το ιστορικό ενός ασθενή πιάνει ολόκληρη
// τη ζωή του - παιδικά εμβόλια, νοσηλίες δεκαετιών πριν.
export function validatePastDate(day: string, month: string, year: string): string | null {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
    return 'Παρακαλώ συμπληρώστε πλήρη ημερομηνία (ΗΗ/ΜΜ/ΕΕΕΕ).';
  }

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (m < 1 || m > 12) return 'Ο μήνας πρέπει να είναι από 01 έως 12.';

  // Ο κατασκευαστής της Date "διορθώνει" σιωπηλά το 31/02 σε 03/03, οπότε συγκρίνουμε πίσω:
  // αν δεν βγήκε η ίδια μέρα, η ημερομηνία δεν υπάρχει στο ημερολόγιο.
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return 'Η ημερομηνία δεν υπάρχει στο ημερολόγιο.';
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) return 'Η ημερομηνία δεν μπορεί να είναι στο μέλλον.';

  if (y < 1900) return 'Το έτος πρέπει να είναι από το 1900 και μετά.';

  return null;
}
