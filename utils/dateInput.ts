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
