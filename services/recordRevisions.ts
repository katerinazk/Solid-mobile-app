// Οι δύο ενέργειες που αλλάζουν μια υπάρχουσα εγγραφή στο Pod, χωρίς ποτέ να χάνεται τίποτα:
// η διόρθωση, που κρατά την προηγούμενη μορφή, και η ανάκληση, που σημαίνει την εγγραφή
// αντί να τη σβήνει.
//
// Και οι δύο διαβάζουν πρώτα το αρχείο όπως είναι ΤΩΡΑ στο Pod και όχι όπως το είδε η οθόνη:
// στο διάστημα που μεσολάβησε μπορεί να το έχει αλλάξει άλλος γιατρός με πρόσβαση, και δεν
// θέλουμε να σβήσουμε τη δουλειά του γράφοντας πάνω σε παλιά εικόνα.

import { fetchFileContentFresh, saveFileContent } from './solidPod';
import { RecordStamp, Retraction, withExistingHistory, withRetraction, withRevision, withoutRetraction } from '../utils/recordRevision';
import { todayIsoDate } from '../utils/podRecords';
import { RecordAuthor } from '../utils/recordAuthor';

async function readRecord(url: string, accessToken: string): Promise<any> {
  const text = await fetchFileContentFresh(url, accessToken);
  return JSON.parse(text);
}

function stampOf(author: RecordAuthor): RecordStamp {
  return { at: todayIsoDate(), by: author.doctorAmka, byName: author.doctorName };
}

/**
 * Αποθηκεύει διορθωμένη εγγραφή, με την προηγούμενη μορφή της φυλαγμένη μέσα στο ίδιο αρχείο.
 *
 * Το "author" είναι όποιος κάνει ΤΗ ΔΙΟΡΘΩΣΗ, που δεν είναι κατ' ανάγκη ο αρχικός συντάκτης.
 */
export async function saveRecordEdit(
  url: string,
  accessToken: string,
  nextRecord: any,
  author: RecordAuthor,
): Promise<void> {
  const existing = await readRecord(url, accessToken);
  await saveFileContent(url, accessToken, JSON.stringify(withRevision(existing, nextRecord, stampOf(author))));
}

/**
 * Αποθηκεύει εγγραφή που ΣΥΜΠΛΗΡΩΘΗΚΕ, χωρίς να μπει τίποτα στο ιστορικό διορθώσεων: το
 * ανέβασμα αποτελέσματος σε εξέταση, η έναρξη μιας αγωγής.
 *
 * Διαβάζει πρώτα την εγγραφή όπως είναι τώρα, για να μη χαθούν η ανάκληση και οι παλιές
 * διορθώσεις - αυτές οι ροές ξαναχτίζουν το αντικείμενο από τα πεδία που ξέρει η οθόνη.
 */
export async function saveRecordCompletion(
  url: string,
  accessToken: string,
  nextRecord: any,
): Promise<void> {
  const existing = await readRecord(url, accessToken);
  await saveFileContent(url, accessToken, JSON.stringify(withExistingHistory(existing, nextRecord)));
}

/** Αναιρεί την ανάκληση: η εγγραφή ξαναγίνεται ενεργή, με ίχνος της ανάκλησης που προηγήθηκε. */
export async function undoRetraction(
  url: string,
  accessToken: string,
  author: RecordAuthor,
): Promise<void> {
  const existing = await readRecord(url, accessToken);
  await saveFileContent(url, accessToken, JSON.stringify(withoutRetraction(existing, stampOf(author))));
}

/** Σημαίνει την εγγραφή ως ανακληθείσα. Το περιεχόμενό της μένει ακέραιο. */
export async function retractRecord(
  url: string,
  accessToken: string,
  author: RecordAuthor,
  reason: string,
): Promise<Retraction> {
  const existing = await readRecord(url, accessToken);
  const stamp = stampOf(author);
  await saveFileContent(url, accessToken, JSON.stringify(withRetraction(existing, stamp, reason)));
  return { ...stamp, reason: reason.trim() };
}
