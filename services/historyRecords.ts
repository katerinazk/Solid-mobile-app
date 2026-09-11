import { getCategoryFolderUrl, listFolderFilesOrEmpty, fetchFileContent } from './solidPod';
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

// Ο σύνδεσμος ταξιδεύει ως JSON στα params της φόρμας επεξεργασίας.
export function parseLinkedRecord(raw?: string): LinkedRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.url && parsed.category ? (parsed as LinkedRecord) : null;
  } catch {
    return null;
  }
}
