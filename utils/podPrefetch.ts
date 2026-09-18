import {
  HISTORY_CATEGORIES,
  getCategoryFolderUrl,
  listFolderFiles,
  fetchFileContent,
} from '../services/solidPod';
import {
  putListing,
  putContent,
  setCount,
  markPrefetchStarted,
  markPrefetchDone,
} from './podPrefetchStore';
import { ensureDoctors } from './doctorCache';

// Κατεβάζει όλο το ιστορικό του ασθενή μόλις συνδεθεί, ώστε να μην περιμένει όταν πατήσει
// κατηγορία. Πριν από αυτό, κάθε κατηγορία πλήρωνε τον δικό της χρόνο την πρώτη φορά:
// ένα αίτημα για τον κατάλογο του φακέλου και ένα ανά αρχείο.
//
// Τρέχει στο παρασκήνιο και δεν μπλοκάρει τίποτα. Αν αποτύχει, δεν φαίνεται πουθενά: οι
// οθόνες θα ρωτήσουν το Pod κανονικά, όπως έκαναν πάντα.

export async function prefetchAllCategories(webId: string, accessToken: string): Promise<void> {
  if (!webId || !accessToken) return;

  markPrefetchStarted(webId);

  // Οι κατηγορίες η μία μετά την άλλη, τα αρχεία κάθε κατηγορίας μαζί. Δεν ρίχνουμε δεκάδες
  // ταυτόχρονα αιτήματα στο Pod: ο χρήστης πιθανότατα ανοίγει ήδη κάποια οθόνη, και θα
  // ανταγωνιζόμασταν τα δικά της αιτήματα.
  for (const category of HISTORY_CATEGORIES) {
    const folderUrl = getCategoryFolderUrl(webId, category);

    let files: string[];
    try {
      files = await listFolderFiles(folderUrl, accessToken);
    } catch {
      // Ο φάκελος δεν υπάρχει ακόμα - δεν έχει καταχωρηθεί τίποτα σε αυτή την κατηγορία.
      // Το δημοσιεύουμε ως μηδέν, ώστε η αρχική οθόνη να δείξει νούμερο και να μην περιμένει.
      setCount(webId, category, 0);
      continue;
    }

    putListing(folderUrl, files);

    const jsonFiles = files.filter((url) => url.endsWith('.json'));

    // Το νούμερο φεύγει αμέσως προς την αρχική οθόνη, χωρίς να περιμένει τα αρχεία.
    setCount(webId, category, jsonFiles.length);
    // Τα ΑΜΚΑ των γιατρών που εμφανίζονται στις εγγραφές. Τα ονόματα έρχονται από τη βάση,
    // όχι από το Pod, και χωρίς αυτά η κάρτα έδειχνε πρώτα το παλιό αποθηκευμένο όνομα και
    // το διόρθωνε μετά - τρεμόπαιγμα σε κάθε είσοδο.
    const doctorAmkas: string[] = [];
    // Οι ανακληθείσες εγγραφές μένουν στον φάκελο, αλλά δεν είναι ενεργό ιστορικό: δεν
    // πρέπει να φουσκώνουν το νούμερο της αρχικής οθόνης.
    let retracted = 0;

    await Promise.all(
      jsonFiles.map(async (url) => {
        try {
          const text = await fetchFileContent(url, accessToken);
          putContent(url, text);
          try {
            const record = JSON.parse(text);
            if (record?.doctorAmka) doctorAmkas.push(String(record.doctorAmka));
            if (record?.retracted?.at) retracted += 1;
          } catch {
            // Αρχείο που δεν είναι έγκυρο JSON - το αγνοούμε εδώ, το φιλτράρει η οθόνη.
          }
        } catch {
          // Ένα αρχείο που δεν διαβάστηκε απλώς δεν προφορτώνεται.
        }
      })
    );

    ensureDoctors(doctorAmkas);

    // Διόρθωση του νούμερου τώρα που ξέρουμε τι περιέχουν τα αρχεία. Το πρώτο νούμερο
    // στάλθηκε πριν διαβαστούν, για να μην περιμένει η αρχική οθόνη.
    if (retracted > 0) setCount(webId, category, jsonFiles.length - retracted);
  }

  markPrefetchDone(webId);
}
