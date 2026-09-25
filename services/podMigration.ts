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
// Η μεταφορά χρειάζεται πρόσβαση και στα δύο Pod, αλλά ο ασθενής συνδέεται σε ένα κάθε φορά.
// Γι' αυτό, τη στιγμή που επιλέγει "Σύνδεση με άλλο Pod" και απαντά "Ναι", κρατάμε ΜΟΝΟ στη
// μνήμη (ποτέ στη συσκευή) το token του παλιού Pod. Μόλις συνδεθεί στο νέο, το ιστορικό
// αντιγράφεται απευθείας από το ένα Pod στο άλλο. Το παλιό Pod δεν αγγίζεται: η εφαρμογή δεν
// σβήνει ποτέ τίποτα, οπότε οι εγγραφές μένουν και εκεί.

// Πόση ώρα ισχύει η μεταφορά που περιμένει τη σύνδεση στο νέο Pod. Μετά, το token του παλιού
// Pod δεν κρατιέται άλλο στη μνήμη.
const STAGED_MIGRATION_MAX_AGE_MS = 15 * 60 * 1000;

interface StagedMigration {
  patientAmka: string;
  oldWebId: string;
  oldAccessToken: string;
  stagedAt: number;
}

let staged: StagedMigration | null = null;

export function stagePodMigration(patientAmka: string, oldWebId: string, oldAccessToken: string) {
  staged = { patientAmka, oldWebId, oldAccessToken, stagedAt: Date.now() };
}

export function clearPodMigration() {
  staged = null;
}

/**
 * Παραλαβή της μεταφοράς που περιμένει, για τον ασθενή που μόλις συνδέθηκε. Ό,τι κι αν βγει,
 * η μεταφορά σβήνεται από τη μνήμη: ή γίνεται τώρα, ή ανήκει σε άλλον/έχει λήξει και δεν
 * πρέπει να μείνει.
 */
export function takePodMigration(patientAmka: string): StagedMigration | null {
  const pending = staged;
  staged = null;
  if (!pending) return null;
  if (pending.patientAmka !== patientAmka) return null;
  if (Date.now() - pending.stagedAt > STAGED_MIGRATION_MAX_AGE_MS) return null;
  return pending;
}

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
  failed: number;
}

/**
 * Αντιγράφει όλες τις εγγραφές και τα συνημμένα τους από το παλιό στο νέο Pod.
 *
 * Κάθε αρχείο κρατά το ίδιο όνομα, οπότε οι συνδέσεις μεταξύ εγγραφών και τα συνημμένα
 * βρίσκουν τον δρόμο τους. Οι διευθύνσεις του παλιού Pod μέσα στις εγγραφές (π.χ. οι
 * σύνδεσμοι προς άλλες εγγραφές) ξαναγράφονται ώστε να δείχνουν στο νέο.
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
  const result: MigrationResult = { copied: 0, failed: 0 };

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

    for (const oldUrl of files.filter((url) => url.endsWith('.json'))) {
      try {
        const name = lastSegment(oldUrl);
        const newUrl = `${newFolder}${name}`;

        const text = await fetchFileContentFresh(oldUrl, oldAccessToken);
        await saveFileContent(newUrl, newAccessToken, text.split(oldBase).join(newBase));

        await copyAttachments(oldUrl, newUrl, oldAccessToken, newAccessToken);
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
