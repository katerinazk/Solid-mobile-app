import { createdAtFromUrl } from './podRecords';

// Σταδιακή φόρτωση εγγραφών από το Pod, με τις πιο πρόσφατες πρώτες.
//
// Το Solid δεν έχει ερώτημα τύπου βάσης: κάθε εγγραφή είναι ξεχωριστό αρχείο, οπότε μια
// κατηγορία με 40 εγγραφές θέλει 40 αιτήματα. Με await Promise.all η οθόνη έμενε άδεια μέχρι
// να απαντήσει και το τελευταίο, δηλαδή όσο το πιο αργό αίτημα όλων.
//
// Εδώ γίνονται δύο πράγματα. Πρώτον, τα αρχεία διαβάζονται με σειρά προτεραιότητας, από το
// πιο πρόσφατο προς το παλαιότερο, γιατί αυτά ψάχνει συνήθως ο χρήστης. Δεύτερον, οι εγγραφές
// μπαίνουν στη λίστα όσο καταφθάνουν. Ο συνολικός χρόνος δεν αλλάζει, αλλά η πρώτη εικόνα
// έρχεται πολύ νωρίτερα.

// Κάθε πόσο το πολύ ενημερώνεται η οθόνη όσο κατεβαίνουν τα υπόλοιπα αρχεία. Χωρίς αυτό το
// φρένο θα γινόταν μία επανασχεδίαση ανά αρχείο, που κοστίζει περισσότερο από όσο κερδίζει.
const FLUSH_INTERVAL_MS = 120;

// Πόσα αρχεία διαβάζονται στην πρώτη φάση. Όσα γεμίζουν μια σελίδα ιστορικού: τα υπόλοιπα δεν
// φαίνονται καν πριν ο χρήστης αλλάξει σελίδα.
const FIRST_BATCH_SIZE = 5;

interface Options<T> {
  /** Οι διευθύνσεις των αρχείων προς ανάγνωση. */
  urls: string[];
  /** Διαβάζει ένα αρχείο. Επιστρέφει null για ό,τι δεν είναι έγκυρη εγγραφή. */
  parse: (url: string) => Promise<T | null>;
  /** Προαιρετική ταξινόμηση, αν η οθόνη δεν ταξινομεί μόνη της αργότερα. */
  compare?: (a: T, b: T) => number;
  /** Καλείται με τη λίστα όπως μεγαλώνει. Παραλείπεται στις σιωπηλές ανανεώσεις. */
  onPartial?: (records: T[]) => void;
}

export async function loadProgressively<T>({ urls, parse, compare, onPartial }: Options<T>): Promise<T[]> {
  // Η σειρά προκύπτει από το όνομα του αρχείου, χωρίς να χρειαστεί να διαβαστεί κανένα.
  const ordered = [...urls].sort((a, b) => createdAtFromUrl(b) - createdAtFromUrl(a));

  const collected: T[] = [];
  let lastFlush = 0;

  const snapshot = () => (compare ? [...collected].sort(compare) : [...collected]);

  const read = async (url: string, progressive: boolean) => {
    let record: T | null = null;
    try {
      record = await parse(url);
    } catch {
      // Ένα χαλασμένο ή απροσπέλαστο αρχείο δεν πρέπει να ρίξει ολόκληρη τη λίστα.
      record = null;
    }
    if (record === null) return;

    collected.push(record);

    if (!onPartial || !progressive) return;
    const now = Date.now();
    if (now - lastFlush >= FLUSH_INTERVAL_MS) {
      lastFlush = now;
      onPartial(snapshot());
    }
  };

  // Φάση 1: οι πιο πρόσφατες. Τις περιμένουμε μαζί και τις δείχνουμε με μία κίνηση, ώστε η
  // πρώτη σελίδα να εμφανιστεί γεμάτη αντί να χτίζεται εγγραφή προς εγγραφή μπροστά στα μάτια.
  await Promise.all(ordered.slice(0, FIRST_BATCH_SIZE).map((url) => read(url, false)));
  if (onPartial && collected.length > 0) {
    lastFlush = Date.now();
    onPartial(snapshot());
  }

  // Φάση 2: όλες οι υπόλοιπες, σταδιακά από κάτω.
  await Promise.all(ordered.slice(FIRST_BATCH_SIZE).map((url) => read(url, true)));

  return snapshot();
}
