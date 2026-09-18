// Προσωρινή μνήμη με ό,τι κατέβηκε από το Pod κατά τη σύνδεση, ένα επίπεδο πιο κάτω από τις
// εγγραφές: εδώ μένουν ωμοί κατάλογοι φακέλων και ωμά περιεχόμενα αρχείων.
//
// Γιατί εδώ και όχι στη μνήμη εγγραφών: κάθε οθόνη ιστορικού μετατρέπει τα αρχεία σε δικό της
// τύπο, με δικά της πεδία. Αν προφορτώναμε εγγραφές, θα έπρεπε να αντιγραφεί η μετατροπή και
// των έξι κατηγοριών σε δεύτερο σημείο, με κίνδυνο να αποκλίνουν. Προφορτώνοντας το κείμενο
// των αρχείων, οι οθόνες μένουν ανέπαφες και απλώς βρίσκουν την απάντηση στη μνήμη.
//
// Κάθε εγγραφή ΚΑΤΑΝΑΛΩΝΕΤΑΙ στην πρώτη ανάγνωση. Έτσι η πρώτη είσοδος στην οθόνη είναι
// ακαριαία, αλλά η αυτόματη ανανέωση κάθε 15 δευτερόλεπτα ξαναρωτά το Pod κανονικά και δεν
// κινδυνεύει να δείξει κάτι παλιό.
//
// ΜΟΝΟ στη μνήμη. Τα ιατρικά δεδομένα δεν γράφονται ποτέ στον δίσκο της συσκευής, και η μνήμη
// αδειάζει στην αποσύνδεση ώστε να μη μένει τίποτα από τον προηγούμενο χρήστη.

const listings = new Map<string, string[]>();
const contents = new Map<string, string>();

export function putListing(folderUrl: string, files: string[]): void {
  listings.set(folderUrl, files);
}

export function putContent(url: string, text: string): void {
  contents.set(url, text);
}

/** Επιστρέφει τον προφορτωμένο κατάλογο και τον αφαιρεί. undefined αν δεν υπάρχει. */
export function takeListing(folderUrl: string): string[] | undefined {
  const files = listings.get(folderUrl);
  if (files) listings.delete(folderUrl);
  return files;
}

/** Επιστρέφει το προφορτωμένο περιεχόμενο και το αφαιρεί. undefined αν δεν υπάρχει. */
export function takeContent(url: string): string | undefined {
  const text = contents.get(url);
  if (text !== undefined) contents.delete(url);
  return text;
}

/** Καλείται στην αποσύνδεση και στην αλλαγή Pod. */
export function clearPodPrefetch(): void {
  listings.clear();
  contents.clear();
  counts.clear();
  started.clear();
  done.clear();
  countsAt = 0;
}

// --- Νούμερα εγγραφών ανά κατηγορία ---
//
// Η αρχική οθόνη έδειχνε πλήθος εγγραφών κάνοντας μόνη της έξι αναζητήσεις φακέλων, την ίδια
// δουλειά που κάνει και η προφόρτωση. Τα νούμερα άργουν να εμφανιστούν και το δίκτυο
// πληρωνόταν δύο φορές. Πλέον η προφόρτωση τα δημοσιεύει εδώ μόλις τα μάθει, μία κατηγορία
// τη φορά, και η οθόνη τα διαβάζει καθώς έρχονται.

const counts = new Map<string, number>();
const started = new Set<string>();
const done = new Set<string>();
const listeners = new Set<() => void>();
let countsAt = 0;

function countKey(webId: string, category: string): string {
  return `${webId}|${category}`;
}

export function setCount(webId: string, category: string, total: number): void {
  if (!webId) return;
  counts.set(countKey(webId, category), total);
  countsAt = Date.now();
  listeners.forEach((listener) => listener());
}

export function getCount(webId: string, category: string): number | undefined {
  if (!webId) return undefined;
  return counts.get(countKey(webId, category));
}

/** Πόση ώρα πέρασε από το τελευταίο νούμερο. Infinity όταν δεν έχει μετρηθεί τίποτα. */
export function countsAge(): number {
  return countsAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - countsAt;
}

export function subscribeCounts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markPrefetchStarted(webId: string): void {
  if (webId) started.add(webId);
}

export function markPrefetchDone(webId: string): void {
  if (webId) done.add(webId);
}

/** Τρέχει τώρα προφόρτωση; Τότε η οθόνη περιμένει αντί να μετρήσει η ίδια τα ίδια πράγματα. */
export function isPrefetchRunning(webId: string): boolean {
  return started.has(webId) && !done.has(webId);
}
