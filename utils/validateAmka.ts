// Τα πρώτα 4 ψηφία του ΑΜΚΑ είναι η ημέρα+μήνας γέννησης (ΗΗΜΜ, το έτος ΕΕ ακολουθεί χωρίς να
// ελέγχεται εδώ - δεν ξέρουμε τον αιώνα από μόνα τους τα 2 ψηφία). Ο Φεβρουάριος επιτρέπεται
// μέχρι 29 ανεξαρτήτως δίσεκτου, ώστε να μην απορρίπτεται σωστό ΑΜΚΑ επειδή δεν μπορούμε να
// μαντέψουμε τον αιώνα.
function hasValidBirthDatePrefix(digits: string): boolean {
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

// Επικυρώνει τη μορφή ενός ΑΜΚΑ: 11 ψηφία, τα πρώτα 4 να σχηματίζουν πραγματική ημέρα/μήνα
// γέννησης, και το τελευταίο να είναι ψηφίο ελέγχου κατά τον αλγόριθμο Luhn (ίδιος με των
// πιστωτικών καρτών) - έτσι υπολογίζεται το πραγματικό ΑΜΚΑ.
// Πιάνει τυπογραφικά λάθη (λάθος αριθμός ψηφίων, γράμματα, αντιμετάθεση ψηφίων) πριν
// καταχωρηθεί μόνιμα λάθος ΑΜΚΑ - δεν επαληθεύει βέβαια ότι ανήκει πράγματι στον χρήστη.
export function isValidAmka(value: string): boolean {
  const digits = value.trim();
  if (!/^\d{11}$/.test(digits)) return false;
  if (!hasValidBirthDatePrefix(digits)) return false;

  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
