// Επικυρώνει τη μορφή ενός ΑΜΚΑ: 11 ψηφία, με το τελευταίο να είναι ψηφίο ελέγχου κατά τον
// αλγόριθμο Luhn (ίδιος με των πιστωτικών καρτών) - το πραγματικό ΑΜΚΑ υπολογίζεται έτσι.
// Πιάνει τυπογραφικά λάθη (λάθος αριθμός ψηφίων, γράμματα, αντιμετάθεση ψηφίων) πριν
// καταχωρηθεί μόνιμα λάθος ΑΜΚΑ - δεν επαληθεύει βέβαια ότι ανήκει πράγματι στον χρήστη.
export function isValidAmka(value: string): boolean {
  const digits = value.trim();
  if (!/^\d{11}$/.test(digits)) return false;

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
