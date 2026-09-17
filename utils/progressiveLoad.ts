// Σταδιακή φόρτωση εγγραφών από το Pod.
//
// Το Solid δεν έχει ερώτημα τύπου βάσης: κάθε εγγραφή είναι ξεχωριστό αρχείο, οπότε μια
// κατηγορία με 40 εγγραφές θέλει 40 αιτήματα. Με await Promise.all η οθόνη έμενε άδεια μέχρι
// να απαντήσει και το τελευταίο, δηλαδή όσο το πιο αργό αίτημα όλων.
//
// Εδώ οι εγγραφές μπαίνουν στη λίστα όσο καταφθάνουν. Ο συνολικός χρόνος δεν αλλάζει, αλλά ο
// χρήστης βλέπει τις πρώτες αμέσως αντί για λευκή οθόνη.

// Κάθε πόσο το πολύ ενημερώνεται η οθόνη όσο κατεβαίνουν τα αρχεία. Χωρίς αυτό θα γινόταν μία
// επανασχεδίαση ανά αρχείο, δηλαδή 40 συνεχόμενες, που κοστίζουν περισσότερο από όσο κερδίζουν.
const FLUSH_INTERVAL_MS = 120;

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
  const collected: T[] = [];
  let lastFlush = 0;

  const snapshot = () => (compare ? [...collected].sort(compare) : [...collected]);

  await Promise.all(
    urls.map(async (url) => {
      let record: T | null = null;
      try {
        record = await parse(url);
      } catch {
        // Ένα χαλασμένο ή απροσπέλαστο αρχείο δεν πρέπει να ρίξει ολόκληρη τη λίστα.
        record = null;
      }
      if (record === null) return;

      collected.push(record);

      if (!onPartial) return;
      const now = Date.now();
      if (now - lastFlush >= FLUSH_INTERVAL_MS) {
        lastFlush = now;
        onPartial(snapshot());
      }
    })
  );

  return snapshot();
}
