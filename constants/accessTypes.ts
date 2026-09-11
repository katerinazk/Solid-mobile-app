// Οι τύποι πρόσβασης που μπορεί να δώσει ο ασθενής σε έναν γιατρό.
//
// Το "Καμία Πρόσβαση" δεν είναι το ίδιο με την κατάργηση: η εγγραφή μένει στη λίστα του
// ασθενή, ώστε να μπορεί να ξαναδώσει πρόσβαση αργότερα χωρίς να ψάχνει πάλι ΑΜΚΑ. Ο γιατρός
// όμως φεύγει από το ACL του Pod και ο ασθενής εξαφανίζεται από τη δική του λίστα.
export const ACCESS_FULL = 'Πλήρης Πρόσβαση';
export const ACCESS_READ_ONLY = 'Μόνο Ανάγνωση';
export const ACCESS_NONE = 'Καμία Πρόσβαση';

// Όλοι οι τύποι, με τη σειρά που εμφανίζονται στην οθόνη προσβάσεων.
export const ACCESS_TYPES = [ACCESS_FULL, ACCESS_READ_ONLY, ACCESS_NONE];

// Οι τύποι που δίνονται σε νέα πρόσβαση. Το "Καμία Πρόσβαση" δεν έχει νόημα ως αφετηρία.
export const GRANTABLE_ACCESS_TYPES = [ACCESS_FULL, ACCESS_READ_ONLY];

// Γράφεται αυτός ο γιατρός στο ACL του Pod;
export function grantsPodAccess(accessType?: string): boolean {
  return accessType !== ACCESS_NONE;
}
