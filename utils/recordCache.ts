// Προσωρινή μνήμη με τις εγγραφές ιστορικού, ανά Pod και κατηγορία.
//
// Το Solid δεν έχει ερώτημα τύπου βάσης: κάθε εγγραφή είναι ξεχωριστό αρχείο, οπότε μια οθόνη
// με 40 εγγραφές κάνει 41 αιτήματα στο Pod. Χωρίς μνήμη, το ίδιο κόστος πληρωνόταν ξανά σε
// κάθε είσοδο στην οθόνη, ακόμα κι αν ο χρήστης μόλις είχε γυρίσει πίσω.
//
// Η στρατηγική είναι "δείξε ό,τι έχεις, ρώτα ταυτόχρονα": η οθόνη ζωγραφίζει αμέσως το
// περιεχόμενο της μνήμης και παράλληλα ξαναδιαβάζει το Pod στο παρασκήνιο, χωρίς κύκλο
// φόρτωσης. Όταν έρθει η απάντηση, η λίστα ενημερώνεται.
//
// ΜΟΝΟ στη μνήμη. Τα ιατρικά δεδομένα δεν γράφονται ποτέ στον δίσκο της συσκευής, και η μνήμη
// αδειάζει στην αποσύνδεση ώστε να μη μένει τίποτα από τον προηγούμενο χρήστη.

const cache = new Map<string, unknown[]>();

// Το Pod μπαίνει στο κλειδί: ο γιατρός βλέπει πολλούς ασθενείς, και οι εγγραφές του ενός δεν
// πρέπει ποτέ να εμφανιστούν στον φάκελο του άλλου.
function cacheKey(webId: string, category: string): string {
  return `${webId}|${category}`;
}

export function getCachedRecords<T>(webId: string, category: string): T[] | undefined {
  if (!webId) return undefined;
  return cache.get(cacheKey(webId, category)) as T[] | undefined;
}

export function setCachedRecords<T>(webId: string, category: string, records: T[]): void {
  if (!webId) return;
  cache.set(cacheKey(webId, category), records);
}

/** Καλείται στην αποσύνδεση και στην αλλαγή Pod. */
export function clearRecordCache(): void {
  cache.clear();
}
