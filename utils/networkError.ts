// Ξεχωρίζει ένα σφάλμα δικτύου (καθόλου/κομμένη σύνδεση) από κάθε άλλο σφάλμα.
//
// Όταν δεν υπάρχει καθόλου σύνδεση, το fetch του React Native πετάει ένα σφάλμα με μήνυμα
// "Network request failed" (ή "Failed to fetch"/"Load failed" ανάλογα με την πλατφόρμα) -
// αγγλικό και τεχνικό, ακατάλληλο να φανεί αυτούσιο σε μια εφαρμογή αποκλειστικά στα ελληνικά.
const NETWORK_ERROR_SIGNATURES = ['network request failed', 'failed to fetch', 'load failed'];

export function isNetworkError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return NETWORK_ERROR_SIGNATURES.some((signature) => message.includes(signature));
}

export const NETWORK_ERROR_MESSAGE = 'Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τη σύνδεσή σας στο διαδίκτυο και δοκιμάστε ξανά.';

/**
 * Το μήνυμα που πρέπει να δείξει η οθόνη για ένα σφάλμα: το δικό του ελληνικό μήνυμα αν είναι
 * σφάλμα δικτύου, αλλιώς το μήνυμα του ίδιου του σφάλματος (π.χ. από τον Solid provider ή τη
 * βάση) ή, αν λείπει, το fallback που δίνει η κλήση.
 */
export function friendlyErrorMessage(error: any, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return error?.message || fallback;
}
