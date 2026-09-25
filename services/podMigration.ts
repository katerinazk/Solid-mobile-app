import * as FileSystem from 'expo-file-system/legacy';
import {
  HISTORY_CATEGORIES,
  getCategoryFolderUrl,
  getPublicFolderUrl,
  getAttachmentsFolderUrl,
  listFolderFilesOrEmpty,
  fetchFileContentFresh,
  saveFileContent,
  downloadAttachment,
  uploadAttachment,
} from './solidPod';

// Μεταφορά του ιατρικού ιστορικού ενός ασθενή από το παλιό Pod του στο νέο, όταν αλλάζει Pod.
//
// Ο ασθενής συνδέεται στο νέο Pod ΧΩΡΙΣ να αποσυνδεθεί από το παλιό, οπότε η εφαρμογή έχει για
// λίγο στη μνήμη και τα δύο tokens και αντιγράφει απευθείας από το ένα Pod στο άλλο. Το παλιό
// Pod δεν αγγίζεται: η εφαρμογή δεν σβήνει ποτέ τίποτα, οπότε οι εγγραφές μένουν και εκεί.

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  txt: 'text/plain',
};

function mimeTypeOf(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

function lastSegment(url: string): string {
  return url.replace(/\/+$/, '').split('/').pop() || '';
}

export interface MigrationResult {
  copied: number;
  /** Υπήρχαν ήδη στο νέο Pod (ίδιο όνομα αρχείου) και δεν αγγίχτηκαν. */
  alreadyThere: number;
  failed: number;
}

/**
 * Αντιγράφει όλες τις εγγραφές και τα συνημμένα τους από το παλιό στο νέο Pod.
 *
 * Κάθε αρχείο κρατά το ίδιο όνομα, οπότε οι συνδέσεις μεταξύ εγγραφών και τα συνημμένα
 * βρίσκουν τον δρόμο τους. Οι διευθύνσεις του παλιού Pod μέσα στις εγγραφές (π.χ. οι
 * σύνδεσμοι προς άλλες εγγραφές) ξαναγράφονται ώστε να δείχνουν στο νέο.
 *
 * Αν το νέο Pod έχει ήδη κάποιες από τις εγγραφές (π.χ. από προηγούμενη χρήση ή μεταφορά που
 * διακόπηκε), αντιγράφονται μόνο όσες λείπουν: μια εγγραφή που υπάρχει δεν ξαναγράφεται ποτέ,
 * ώστε να μη χαθεί τίποτα που έχει διορθωθεί ή προστεθεί εκεί στο μεταξύ.
 *
 * Ένα αρχείο που αποτυγχάνει δεν σταματά τα υπόλοιπα - μετριέται και αναφέρεται στο τέλος.
 * Τα συνημμένα περνούν για λίγο από την προσωρινή μνήμη της εφαρμογής και σβήνονται αμέσως
 * μετά το ανέβασμα.
 */
export async function copyHistoryBetweenPods(
  oldWebId: string,
  oldAccessToken: string,
  newWebId: string,
  newAccessToken: string,
): Promise<MigrationResult> {
  const oldBase = getPublicFolderUrl(oldWebId);
  const newBase = getPublicFolderUrl(newWebId);
  const result: MigrationResult = { copied: 0, alreadyThere: 0, failed: 0 };

  for (const category of HISTORY_CATEGORIES) {
    const oldFolder = getCategoryFolderUrl(oldWebId, category);
    const newFolder = getCategoryFolderUrl(newWebId, category);

    let files: string[];
    try {
      files = await listFolderFilesOrEmpty(oldFolder, oldAccessToken);
    } catch {
      // Δεν διαβάστηκε η κατηγορία: δεν ξέρουμε πόσες εγγραφές είχε, οπότε μετράει ως αποτυχία.
      result.failed += 1;
      continue;
    }

    // Ό,τι υπάρχει ήδη στον αντίστοιχο φάκελο του νέου Pod. Αν η ανάγνωση αποτύχει, δεν ξέρουμε
    // τι υπάρχει - καλύτερα να σταματήσουμε την κατηγορία παρά να γράψουμε πάνω σε υπάρχοντα.
    let existingNames: Set<string>;
    try {
      const existing = await listFolderFilesOrEmpty(newFolder, newAccessToken);
      existingNames = new Set(existing.map(lastSegment));
    } catch {
      result.failed += files.filter((url) => url.endsWith('.json')).length;
      continue;
    }

    for (const oldUrl of files.filter((url) => url.endsWith('.json'))) {
      try {
        const name = lastSegment(oldUrl);
        if (existingNames.has(name)) {
          result.alreadyThere += 1;
          continue;
        }
        const newUrl = `${newFolder}${name}`;

        // Πρώτα τα συνημμένα, μετά η εγγραφή: αν η μεταφορά διακοπεί στη μέση, η εγγραφή δεν θα
        // υπάρχει ακόμα στο νέο Pod και θα αντιγραφεί ολόκληρη την επόμενη φορά.
        await copyAttachments(oldUrl, newUrl, oldAccessToken, newAccessToken);
        const text = await fetchFileContentFresh(oldUrl, oldAccessToken);
        await saveFileContent(newUrl, newAccessToken, text.split(oldBase).join(newBase));
        result.copied += 1;
      } catch (error) {
        console.error('Αποτυχία μεταφοράς εγγραφής:', error);
        result.failed += 1;
      }
    }
  }

  return result;
}

async function copyAttachments(oldRecordUrl: string, newRecordUrl: string, oldToken: string, newToken: string) {
  const attachmentUrls = await listFolderFilesOrEmpty(getAttachmentsFolderUrl(oldRecordUrl), oldToken);

  for (const attachmentUrl of attachmentUrls) {
    const fileName = decodeURIComponent(lastSegment(attachmentUrl));
    if (!fileName) continue;

    const localUri = await downloadAttachment(oldRecordUrl, fileName, oldToken);
    try {
      await uploadAttachment(newRecordUrl, fileName, localUri, mimeTypeOf(fileName), newToken);
    } finally {
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }
}
