import { getCategoryFolderUrl, listFolderFiles, listFolderFilesOrEmpty, fetchFileContent, saveFileContent } from './solidPod';
import { isCompleteRecord } from '../utils/podRecords';

// Μια εγγραφή ιστορικού όπως χρειάζεται για να τη διαλέξει κανείς από λίστα: ονομασία,
// κωδικός προτύπου και μια ημερομηνία για να ξεχωρίζουν οι όμοιες μεταξύ τους.
export interface HistoryRecordSummary {
  url: string;
  category: string;
  title: string;
  code?: string;
  parentName?: string;
  date?: string;
  // Οι συνδέσεις της ίδιας της εγγραφής. Τις χρειαζόμαστε για να βρούμε και την αντίστροφη
  // κατεύθυνση: ποια φάρμακα ή εξετάσεις δείχνουν προς μια διάγνωση.
  links?: LinkedRecord[];
}

// Κάθε κατηγορία ονομάζει αλλιώς την ημερομηνία της.
const DATE_FIELDS: Record<string, string[]> = {
  'Διαγνώσεις': ['date'],
  'Νοσηλίες': ['admissionDate'],
  'Εμβολιασμοί': ['administeredDate'],
  'Φάρμακα': ['startDate'],
  'Εξετάσεις': ['completedDate', 'createdDate'],
  'Αλλεργίες': [],
};

function pickDate(category: string, record: any): string | undefined {
  for (const field of DATE_FIELDS[category] || []) {
    if (record[field]) return record[field];
  }
  return undefined;
}

/**
 * Διαβάζει όλες τις εγγραφές μιας κατηγορίας από το Pod του ασθενή.
 *
 * Επιστρέφει εγγραφές ΟΛΩΝ των γιατρών, όχι μόνο του συνδεδεμένου: μια αγωγή μπορεί κάλλιστα
 * να δίνεται για διάγνωση που έθεσε άλλος συνάδελφος.
 */
export async function fetchCategoryRecords(
  webId: string,
  category: string,
  accessToken: string
): Promise<HistoryRecordSummary[]> {
  const files = await listFolderFilesOrEmpty(getCategoryFolderUrl(webId, category), accessToken);

  const loaded = await Promise.all(
    files
      .filter((url) => url.endsWith('.json'))
      .map(async (url) => {
        try {
          const record = JSON.parse(await fetchFileContent(url, accessToken));
          if (!isCompleteRecord(category, record)) return null;

          return {
            url,
            category,
            title: record.title,
            code: record.code,
            parentName: record.parentName,
            date: pickDate(category, record),
            links: readLinks(record),
          } as HistoryRecordSummary;
        } catch {
          return null;
        }
      })
  );

  const valid = loaded.filter((r): r is HistoryRecordSummary => r !== null);

  // Οι πιο πρόσφατες πρώτες: αυτές αφορούν συνήθως τον λόγο της τωρινής επίσκεψης.
  valid.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  return valid;
}

// Ο σύνδεσμος όπως αποθηκεύεται μέσα στην εγγραφή του φαρμάκου ή της εξέτασης. Κρατάμε και
// την ονομασία, όχι μόνο το URL: έτσι η κάρτα δείχνει με τι συνδέεται χωρίς δεύτερο αίτημα
// στο Pod, και εξακολουθεί να λέει κάτι ακόμα κι αν η αρχική εγγραφή διαγραφεί αργότερα.
export interface LinkedRecord {
  category: string;
  url: string;
  title: string;
  code?: string;
  parentName?: string;
}

// Στον ενικό, για να διαβάζεται σωστά η κάρτα: "Σύνδεση με: Διάγνωση - ...".
export const CATEGORY_SINGULAR: Record<string, string> = {
  'Διαγνώσεις': 'Διάγνωση',
  'Νοσηλίες': 'Νοσηλία',
  'Εμβολιασμοί': 'Εμβολιασμός',
  'Φάρμακα': 'Φάρμακο',
  'Εξετάσεις': 'Εξέταση',
  'Αλλεργίες': 'Αλλεργία',
};

// Οι σύνδεσμοι ταξιδεύουν ως JSON πίνακας στα params της φόρμας επεξεργασίας.
export function parseLinkedRecords(raw?: string): LinkedRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.url && l.category) : [];
  } catch {
    return [];
  }
}

// Διαβάζει τους συνδέσμους από μια εγγραφή του Pod. Οι πρώτες εγγραφές που απέκτησαν σύνδεση
// κρατούσαν μία μόνο, στο πεδίο "link" - τη δεχόμαστε ακόμα ώστε να μη χαθεί.
export function readLinks(record: any): LinkedRecord[] {
  if (Array.isArray(record?.links)) return record.links;
  if (record?.link) return [record.link];
  return [];
}


// Μόνο τα φάρμακα και οι εξετάσεις κρατούν συνδέσμους. Για την αντίστροφη αναζήτηση ("ποιος
// δείχνει προς αυτή τη διάγνωση;") αρκεί να κοιτάξουμε αυτές τις δύο κατηγορίες.
const LINKING_CATEGORIES = ['Φάρμακα', 'Εξετάσεις'];

export async function fetchRecordSummary(
  url: string,
  category: string,
  accessToken: string
): Promise<HistoryRecordSummary | null> {
  try {
    const record = JSON.parse(await fetchFileContent(url, accessToken));
    if (!isCompleteRecord(category, record)) return null;

    return {
      url,
      category,
      title: record.title,
      code: record.code,
      parentName: record.parentName,
      date: pickDate(category, record),
      links: readLinks(record),
    };
  } catch {
    return null;
  }
}

/**
 * Κρατά μόνο τους συνδέσμους που δείχνουν σε αρχείο το οποίο υπάρχει ακόμα στο Pod.
 *
 * Αν ο φάκελος δεν διαβάζεται, τους επιστρέφει όλους: μια στιγμιαία αποτυχία δικτύου δεν
 * πρέπει να περάσει για διαγραμμένη εγγραφή.
 */
export async function filterExistingLinks(
  webId: string,
  links: LinkedRecord[],
  accessToken: string
): Promise<LinkedRecord[]> {
  if (links.length === 0) return links;

  const categories = [...new Set(links.map((link) => link.category))];
  const existing = new Set<string>();
  try {
    const listings = await Promise.all(
      categories.map((category) => listFolderFiles(getCategoryFolderUrl(webId, category), accessToken))
    );
    for (const url of listings.flat()) existing.add(url);
  } catch {
    return links;
  }

  return links.filter((link) => existing.has(link.url));
}

/**
 * Σβήνει από την εγγραφή τους συνδέσμους που δείχνουν σε αρχείο το οποίο δεν υπάρχει πια,
 * και επιστρέφει όσους απέμειναν.
 *
 * Η ύπαρξη κρίνεται από τη λίστα του φακέλου και όχι από αποτυχία ανάγνωσης: μια στιγμιαία
 * αποτυχία δικτύου δεν πρέπει να σβήσει σωστές συνδέσεις.
 */
async function pruneDeletedLinks(
  webId: string,
  recordUrl: string,
  record: any,
  links: LinkedRecord[],
  accessToken: string
): Promise<LinkedRecord[]> {
  if (links.length === 0) return links;

  const alive = await filterExistingLinks(webId, links, accessToken);
  if (alive.length === links.length) return links;

  try {
    const updated = { ...record, links: alive.length > 0 ? alive : undefined };
    delete updated.link; // το παλιό πεδίο του ενικού
    await saveFileContent(recordUrl, accessToken, JSON.stringify(updated));
  } catch {
    // Χωρίς δικαίωμα εγγραφής δεν σβήνεται το αρχείο, αλλά ο σύνδεσμος δεν εμφανίζεται.
  }

  return alive;
}

/**
 * Ό,τι σχετίζεται με μια εγγραφή, και προς τις δύο κατευθύνσεις:
 *   - όσες συνέδεσε ο γιατρός μαζί της (π.χ. η διάγνωση για την οποία δόθηκε το φάρμακο)
 *   - όσες δείχνουν προς αυτήν (π.χ. τα φάρμακα που δόθηκαν για μια διάγνωση)
 *
 * Έτσι η σχέση διαβάζεται από όποια πλευρά κι αν την ανοίξει κανείς. Αν η συνδεδεμένη
 * εγγραφή έχει διαγραφεί, φεύγει και η σύνδεση.
 */
export async function fetchRelatedRecords(
  webId: string,
  recordUrl: string,
  record: any,
  accessToken: string
): Promise<HistoryRecordSummary[]> {
  const links = await pruneDeletedLinks(webId, recordUrl, record, readLinks(record), accessToken);

  const resolved = await Promise.all(
    links.map((link) => fetchRecordSummary(link.url, link.category, accessToken))
  );
  const forward = resolved.filter((summary): summary is HistoryRecordSummary => summary !== null);

  const reverseLists = await Promise.all(
    LINKING_CATEGORIES.map((category) => fetchCategoryRecords(webId, category, accessToken).catch(() => []))
  );
  const reverse = reverseLists
    .flat()
    .filter((item) => item.links?.some((link) => link.url === recordUrl));

  // Η ίδια σχέση μπορεί να υπάρχει και στις δύο κατευθύνσεις - κρατάμε μία εγγραφή ανά URL.
  const byUrl = new Map<string, HistoryRecordSummary>();
  for (const item of [...forward, ...reverse]) {
    if (item.url !== recordUrl) byUrl.set(item.url, item);
  }

  return [...byUrl.values()];
}
