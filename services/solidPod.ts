import * as FileSystem from 'expo-file-system/legacy';
import { createDpopToken } from '../utils/dpop';
import { takeListing, takeContent } from '../utils/podPrefetchStore';
import { ACCESS_FULL, grantsPodAccess } from '../constants/accessTypes';
import { isNetworkError } from '../utils/networkError';

// Ανακατασκευάζει το WebID του ασθενή-ιδιοκτήτη από το URL του δημόσιου φακέλου του
// (αντίστροφος μετασχηματισμός του webId.replace('profile/card#me', 'public/') στο AuthContext).
export function getOwnerWebId(folderUrl: string): string {
  return folderUrl.replace('public/', 'profile/card#me');
}

export function getPublicFolderUrl(webId: string): string {
  return webId.replace('profile/card#me', 'public/');
}

/**
 * Μπορεί η εφαρμογή να δουλέψει με αυτό το WebID;
 *
 * Ολόκληρος ο φάκελος του ιστορικού βγαίνει από το WebID με μια αντικατάσταση κειμένου. Αυτό
 * ισχύει σε node-solid-server και σε Community Solid Server - τις δύο οικογένειες που
 * καλύπτει η λίστα παρόχων - όπου το WebID είναι <pod>/profile/card#me.
 *
 * Αλλού (π.χ. Inrupt Pod Spaces, όπου το WebID είναι https://id.inrupt.com/όνομα) η
 * αντικατάσταση δεν πιάνει: ο φάκελος θα έβγαινε ίδιος με το WebID και κάθε ανάγνωση θα
 * απαντούσε 404. Καλύτερα να το πει η εφαρμογή στη σύνδεση, παρά να φανεί ως άδειο ιστορικό.
 */
export function isSupportedWebId(webId: string): boolean {
  return webId.includes('profile/card#me');
}

// Το Pod απαντά 401/403 όταν ο συνδεδεμένος χρήστης δεν είναι (πια) μέσα στο ACL του φακέλου.
// Το ξεχωρίζουμε από τα υπόλοιπα σφάλματα - "δεν υπάρχει ο φάκελος", πρόβλημα δικτύου κ.λπ. -
// γιατί σημαίνει κάτι εντελώς διαφορετικό: ο ασθενής κατάργησε την πρόσβαση.
export class PodAccessDeniedError extends Error {
  constructor() {
    super("Δεν έχετε πλέον πρόσβαση στον φάκελο αυτού του ασθενή.");
    this.name = 'PodAccessDeniedError';
  }
}

export function isPodAccessDenied(error: any): boolean {
  return error?.name === 'PodAccessDeniedError';
}

function throwIfAccessDenied(status: number): void {
  if (status === 401 || status === 403) throw new PodAccessDeniedError();
}

const MEDPOD_FOLDER_NAME = 'MedPod';

// Οι 6 κατηγορίες ιατρικού ιστορικού - κάθε μία έχει δικό της φάκελο μέσα στο MedPod/.
//
// Η ίδια λέξη είναι και το κλειδί της κατηγορίας και το όνομα του φακέλου στο Pod: ό,τι
// βλέπει όποιος ανοίξει τον φάκελο του ασθενή είναι ακριβώς ό,τι γράφει ο κώδικας.
export const HISTORY_CATEGORIES = ['Διαγνώσεις', 'Εξετάσεις', 'Φάρμακα', 'Αλλεργίες', 'Νοσηλείες', 'Εμβολιασμοί'];


export function getCategoryFolderUrl(webId: string, category: string): string {
  return `${getPublicFolderUrl(webId)}${MEDPOD_FOLDER_NAME}/${encodeURIComponent(category)}/`;
}

/**
 * Η κανονική μορφή μιας διεύθυνσης του Pod.
 *
 * Οι φάκελοι των κατηγοριών έχουν ελληνικά ονόματα, οπότε κάθε URL εγγραφής κουβαλά
 * ποσοστιαία κωδικοποίηση (%CE%95...). Όταν όμως ένα τέτοιο URL ταξιδέψει ως παράμετρος
 * διαδρομής - η αναλυτική προβολή, οι φόρμες επεξεργασίας - επιστρέφει ΑΠΟΚΩΔΙΚΟΠΟΙΗΜΕΝΟ,
 * με τα ελληνικά γράμματα ατόφια. Από εκεί και πέρα η υπογραφή DPoP (htu) δεν ταιριάζει με
 * τη διεύθυνση που φεύγει στο δίκτυο, ο διακομιστής απαντά 401 - και επειδή γράφει τη
 * διεύθυνση μέσα στην κεφαλίδα WWW-Authenticate, που δέχεται μόνο ASCII, σκάει με 500.
 *
 * Εδώ επιβάλλεται μία μορφή πριν από κάθε αίτημα: ό,τι υπογράφεται είναι ακριβώς ό,τι
 * ζητείται. Εφαρμόζεται και σε ήδη κωδικοποιημένο URL χωρίς να το αλλάξει.
 */
export function normalizePodUrl(url: string): string {
  const parts = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]+)([^?#]*)(.*)$/i.exec(url);
  if (!parts) return url;

  const [, origin, path, rest] = parts;
  const encodedPath = path
    .split('/')
    .map((segment) => {
      let decoded = segment;
      // Ημιτελές '%' μέσα στο όνομα: το αφήνουμε όπως ήρθε αντί να ρίξουμε το αίτημα.
      try { decoded = decodeURIComponent(segment); } catch {}
      return encodeURIComponent(decoded);
    })
    .join('/');

  return `${origin}${encodedPath}${rest}`;
}

// Δεν δημιουργούμε πια προληπτικά τους φακέλους κατηγοριών (π.χ. με ένα κενό .keep αρχείο).
// Κάθε φάκελος κατηγορίας δημιουργείται αυτόματα από τον ίδιο τον Solid server ως side effect
// του πρώτου πραγματικού saveFileContent (PUT) μέσα του - το ίδιο μοτίβο και για τις 6
// κατηγορίες. Μέχρι τότε, μια οθόνη ιστορικού απλά βλέπει ότι ο φάκελος δεν υπάρχει ακόμα.

export async function listFolderFiles(rawFolderUrl: string, accessToken: string): Promise<string[]> {
  const folderUrl = normalizePodUrl(rawFolderUrl);
  // Αν ο κατάλογος προφορτώθηκε στη σύνδεση, απαντάμε από τη μνήμη χωρίς αίτημα.
  const prefetchedFiles = takeListing(folderUrl);
  if (prefetchedFiles) return prefetchedFiles;

  const dpopToken = await createDpopToken('GET', folderUrl);
  const response = await fetch(folderUrl, {
    method: 'GET',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
      'Accept': 'text/turtle',
    },
  });

  if (!response.ok) {
    throwIfAccessDenied(response.status);
    throw new Error('Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.');
  }

  const text = await response.text();

  // Χαρτογραφούμε τα @prefix ώστε να μπορούμε να επεκτείνουμε "prefixed names" (π.χ. n1:)
  // που ο server χρησιμοποιεί μέσα στη λίστα ldp:contains για nested containers
  // (π.χ. τους φακέλους συνημμένων αρχείων _files/) αντί για πλήρες <URL>.
  const prefixes: Record<string, string> = {};
  for (const prefixMatch of text.matchAll(/@prefix\s+([a-zA-Z0-9_-]*):\s*<([^>]*)>\s*\./g)) {
    prefixes[prefixMatch[1]] = prefixMatch[2];
  }

  // Ισοπεδώνουμε τα newlines ώστε να πιάνουμε και πολυγραμμικές λίστες
  const flatText = text.replace(/\r?\n\s*/g, ' ');
  const fileUrls: string[] = [];
  const itemSource = '<[^>]*>|[a-zA-Z0-9_-]*:';
  // Βρίσκουμε κάθε ldp:contains block - τα περιεχόμενα μπορεί να αναφέρονται είτε ως πλήρες
  // <URI> είτε ως prefixed name (π.χ. n1:) όταν πρόκειται για nested container.
  for (const containsMatch of flatText.matchAll(new RegExp(`ldp:contains\\s+((?:(?:${itemSource})(?:\\s*,\\s*)?)+)`, 'g'))) {
    for (const itemMatch of containsMatch[1].matchAll(new RegExp(itemSource, 'g'))) {
      const token = itemMatch[0];
      let uri: string;
      if (token.startsWith('<')) {
        uri = token.slice(1, -1);
      } else {
        const prefix = token.slice(0, -1);
        if (!(prefix in prefixes)) continue;
        uri = prefixes[prefix];
      }

      if (uri.startsWith('http')) {
        fileUrls.push(uri);
      } else if (uri.startsWith('/')) {
        const parsedBase = new URL(folderUrl);
        fileUrls.push(`${parsedBase.protocol}//${parsedBase.host}${uri}`);
      } else {
        fileUrls.push(`${folderUrl}${uri}`);
      }
    }
  }

  return fileUrls;
}

// Το μοτίβο "δοκίμασε, ξαναδοκίμασε, αλλιώς άδεια λίστα" που χρειάζονται όλες οι οθόνες
// ιστορικού: ο φάκελος μπορεί να μην έχει δημιουργηθεί ακόμα. Εξαίρεση το 403 - εκεί το
// σφάλμα περνάει προς τα πάνω, γιατί δεν σημαίνει "άδειος φάκελος" αλλά "χωρίς πρόσβαση".
export async function listFolderFilesOrEmpty(folderUrl: string, accessToken: string): Promise<string[]> {
  try {
    return await listFolderFiles(folderUrl, accessToken);
  } catch (error) {
    if (isPodAccessDenied(error)) throw error;
  }

  try {
    // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await listFolderFiles(folderUrl, accessToken);
  } catch (error) {
    if (isPodAccessDenied(error)) throw error;
    // Χωρίς σύνδεση δεν ξέρουμε αν ο φάκελος είναι πράγματι άδειος - δεν πρέπει να δείξουμε
    // "καμία εγγραφή" σε ιατρικό ιστορικό σαν να το ξέραμε σίγουρα. Το σφάλμα περνάει προς τα
    // πάνω, ώστε η οθόνη να δείξει μήνυμα σύνδεσης αντί για άδεια λίστα.
    if (isNetworkError(error)) throw error;
    // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - δημιουργείται με την πρώτη καταχώρηση.
    return [];
  }
}

export async function fetchFileContent(rawUrl: string, accessToken: string): Promise<string> {
  const url = normalizePodUrl(rawUrl);
  // Το ίδιο και για το περιεχόμενο: προφορτωμένο αρχείο δεν ξανακατεβαίνει.
  const prefetchedText = takeContent(url);
  if (prefetchedText !== undefined) return prefetchedText;

  return fetchFileContentFresh(url, accessToken);
}

/**
 * Το ίδιο, αλλά αγνοεί ό,τι έχει προφορτωθεί - και το πετάει από τη μνήμη.
 *
 * Το χρησιμοποιούν οι ροές που διαβάζουν ΓΙΑ ΝΑ ΞΑΝΑΓΡΑΨΟΥΝ: η διόρθωση και η ανάκληση. Εκεί
 * μια παλιά εικόνα του αρχείου δεν είναι απλώς ανακρίβεια - θα έσβηνε ό,τι έγραψε στο μεταξύ
 * άλλος γιατρός με πρόσβαση στον ίδιο φάκελο.
 */
export async function fetchFileContentFresh(rawUrl: string, accessToken: string): Promise<string> {
  const url = normalizePodUrl(rawUrl);
  takeContent(url);

  const dpopToken = await createDpopToken('GET', url);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (!response.ok) {
    throwIfAccessDenied(response.status);
    throw new Error('Δεν ήταν δυνατή η ανάγνωση του αρχείου.');
  }

  const text = await response.text();
  return text;
}

// Συνάρτηση διαγραφής αρχείου ΔΕΝ υπάρχει, και δεν είναι παράλειψη.
//
// Η εφαρμογή δεν σβήνει ποτέ ιατρική εγγραφή: η λανθασμένη σημαίνεται ως ανακληθείσα και
// μένει στον φάκελο (utils/recordRevision.ts). Ο ασθενής παραμένει φυσικά κύριος του Pod του
// και μπορεί να σβήσει ό,τι θέλει με άλλο εργαλείο Solid - αλλά όχι από εδώ.

/**
 * Μοναδικό όνομα αρχείου για νέα εγγραφή ιστορικού.
 *
 * Μόνο τα χιλιοστά του δευτερολέπτου δεν αρκούν: δύο γιατροί που αποθηκεύουν την ίδια στιγμή
 * στον ίδιο ασθενή θα έγραφαν στο ίδιο αρχείο και η μία καταχώρηση θα έσβηνε την άλλη, χωρίς
 * να το πάρει είδηση κανείς. Το τυχαίο επίθεμα κάνει τη σύμπτωση πρακτικά αδύνατη.
 */
// Η σήμανση που μπαίνει στο όνομα του αρχείου, πάντα σε 13 ψηφία.
//
// Προτιμάμε την ιατρική ημερομηνία της εγγραφής αντί για τη στιγμή της καταχώρησης, ώστε η
// σειρά των ονομάτων να συμπίπτει με τη σειρά που βλέπει ο χρήστης στην οθόνη. Έτσι η φόρτωση
// μπορεί να κατεβάσει πρώτα ό,τι θα εμφανιστεί πρώτο, χωρίς να ανοίξει κανένα αρχείο.
//
// Η συμπλήρωση με μηδενικά είναι απαραίτητη: μια νοσηλεία του 1995 δίνει δωδεκαψήφια χιλιοστά
// και δεν θα την έβρισκε ο δεκατριαψήφιος αναγνώστης. Ημερομηνίες πριν το 1970 δίνουν αρνητικό
// αριθμό και κρατούν το πρόσημό τους: αν τις μηδενίζαμε, μια νοσηλεία του 1965 θα διαβαζόταν ως
// 1970 και θα συγχεόταν με το μηδέν που σημαίνει "άγνωστη σήμανση".
function recordStamp(clinicalDate?: string): string {
  const parsed = clinicalDate ? new Date(clinicalDate).getTime() : NaN;
  const stamp = Number.isNaN(parsed) ? Date.now() : parsed;
  const sign = stamp < 0 ? '-' : '';
  return sign + String(Math.abs(stamp)).padStart(13, '0');
}

/**
 * Το όνομα μιας νέας εγγραφής.
 *
 * Το τυχαίο κομμάτι κρατά δύο καταχωρήσεις χωριστές όταν πέφτουν στην ίδια στιγμή - ή, τώρα
 * που η σήμανση είναι ημέρα και όχι χιλιοστό, στην ίδια ημέρα.
 *
 * Καλείται μόνο για νέα αρχεία. Σε επεξεργασία το όνομα μένει ως έχει, ακόμα κι αν διορθωθεί
 * η ημερομηνία: οι συνδέσεις μεταξύ εγγραφών κρατούν τη διεύθυνση, και η μετονομασία θα τις
 * έσπαγε όλες.
 */
export function newRecordFileName(prefix = '', clinicalDate?: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}${recordStamp(clinicalDate)}_${random}.json`;
}

export async function saveFileContent(rawUrl: string, accessToken: string, content: string): Promise<void> {
  const url = normalizePodUrl(rawUrl);
  const dpopToken = await createDpopToken('PUT', url);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Accept': '*/*',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
    body: content,
  });

  if (!response.ok) {
    throwIfAccessDenied(response.status);
    const errorText = await response.text();
    throw new Error(`ΚΩΔΙΚΟΣ: ${response.status}\n\nΛΟΓΟΣ:\n${errorText.substring(0, 150)}`);
  }
}

// Ο φάκελος συνημμένων αρχείων μιας συγκεκριμένης εγγραφής (π.χ. μιας νοσηλείας) -
// παράγεται από το URL του ίδιου του .json αρχείου της εγγραφής, ώστε τα αρχεία
// να συνδέονται αυτόματα μαζί της χωρίς επιπλέον μεταδεδομένα.
export function getAttachmentsFolderUrl(recordUrl: string): string {
  return recordUrl.replace(/\.json$/, '') + '_files/';
}

/**
 * Το όνομα με το οποίο αποθηκεύεται ένα συνημμένο.
 *
 * Το όνομα που διαλέγει ο χρήστης γίνεται κομμάτι URL στο Pod και κομμάτι διαδρομής στο
 * τοπικό σύστημα αρχείων. Κενά, παρενθέσεις και στίξη περνούν από τρεις διαφορετικές
 * κωδικοποιήσεις στη διαδρομή - εφαρμογή, διακομιστής, συσκευή - και αρκεί μία να τα
 * χειριστεί αλλιώς για να μη βρίσκεται μετά το αρχείο. Τα γράμματα μένουν ως έχουν,
 * ελληνικά και λατινικά: χάνεται μόνο η στίξη.
 */
export function safeAttachmentName(fileName: string): string {
  return fileName.replace(/[\s()\[\]{}#?&%+,;=@:'"\\/|*<>]+/g, '_').replace(/_+/g, '_');
}

/**
 * Υπάρχει ήδη αρχείο σε αυτή τη διεύθυνση;
 *
 * Απαντά "όχι" σε οποιαδήποτε άλλη απάντηση πλην του 2xx: η ερώτηση είναι βοηθητική και
 * δεν πρέπει να εμποδίσει το ανέβασμα αν ο διακομιστής δεν απαντήσει καθαρά.
 */
async function attachmentExists(fileUrl: string, accessToken: string): Promise<boolean> {
  try {
    const dpopToken = await createDpopToken('HEAD', fileUrl);
    const response = await fetch(fileUrl, {
      method: 'HEAD',
      headers: { 'Authorization': `DPoP ${accessToken}`, 'DPoP': dpopToken },
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

/**
 * Ένα όνομα που δεν πατάει πάνω σε υπάρχον αρχείο.
 *
 * Ο ασθενής που αντικαθιστά το αποτέλεσμα μιας εξέτασης διαλέγει πολύ συχνά αρχείο με το
 * ίδιο όνομα. Ένα PUT στην ίδια διεύθυνση θα έσβηνε το προηγούμενο - και η εφαρμογή δεν
 * σβήνει τίποτα από το Pod: η εγγραφή παύει απλώς να δείχνει στο παλιό αρχείο, που μένει.
 */
async function freeAttachmentName(folderUrl: string, storedName: string, accessToken: string): Promise<string> {
  const isTaken = (name: string) => attachmentExists(`${folderUrl}${encodeURIComponent(name)}`, accessToken);
  if (!(await isTaken(storedName))) return storedName;

  // Η ημερομηνία διαβάζεται - "εξετάσεις_2026-09-20.pdf" λέει πότε ανέβηκε. Αν ανέβουν δύο
  // την ίδια μέρα, χρειάζεται και κάτι τυχαίο για να μην πέσουν πάλι το ένα πάνω στο άλλο.
  const withSuffix = (suffix: string) => {
    const dot = storedName.lastIndexOf('.');
    return dot > 0
      ? `${storedName.slice(0, dot)}_${suffix}${storedName.slice(dot)}`
      : `${storedName}_${suffix}`;
  };

  const today = withSuffix(new Date().toISOString().slice(0, 10));
  return (await isTaken(today)) ? withSuffix(`${new Date().toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 6)}`) : today;
}

/**
 * Ανεβάζει ένα συνημμένο και επιστρέφει το όνομα με το οποίο ΟΝΤΩΣ αποθηκεύτηκε.
 *
 * Ο καλών πρέπει να γράψει στην εγγραφή αυτό το όνομα και όχι το αρχικό: είναι το μόνο
 * με το οποίο θα ξαναβρεθεί το αρχείο.
 */
export async function uploadAttachment(
  rawRecordUrl: string,
  fileName: string,
  localUri: string,
  mimeType: string,
  accessToken: string
): Promise<string> {
  const folderUrl = getAttachmentsFolderUrl(normalizePodUrl(rawRecordUrl));
  const storedName = await freeAttachmentName(folderUrl, safeAttachmentName(fileName), accessToken);
  const fileUrl = `${folderUrl}${encodeURIComponent(storedName)}`;
  const dpopToken = await createDpopToken('PUT', fileUrl);
  const result = await FileSystem.uploadAsync(fileUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throwIfAccessDenied(result.status);
    // Ο διακομιστής εξηγεί σχεδόν πάντα στο σώμα της απάντησης τι δεν πήγε καλά. Χωρίς αυτό
    // ο κωδικός 500 λέει μόνο "κάτι έσπασε στο Pod", που δεν φτάνει για να διορθωθεί.
    const reason = String(result.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(
      `Αποτυχία μεταφόρτωσης του αρχείου "${fileName}" (κωδικός ${result.status}).` +
      (reason ? `

${reason.substring(0, 200)}` : '')
    );
  }

  return storedName;
}

// Κατεβάζει ένα συνημμένο αρχείο τοπικά (cache) ώστε να μπορεί να ανοιχτεί/μοιραστεί
// με το Sharing API. Επιστρέφει το τοπικό file:// URI.
export async function downloadAttachment(
  rawRecordUrl: string,
  fileName: string,
  accessToken: string
): Promise<string> {
  const fileUrl = `${getAttachmentsFolderUrl(normalizePodUrl(rawRecordUrl))}${encodeURIComponent(fileName)}`;
  // Η τοπική διαδρομή καθαρίζεται πάντα: ένα κενό μέσα σε file:// URI δεν διαβάζεται.
  const localUri = `${FileSystem.cacheDirectory}${safeAttachmentName(fileName)}`;
  const dpopToken = await createDpopToken('GET', fileUrl);
  const result = await FileSystem.downloadAsync(fileUrl, localUri, {
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throwIfAccessDenied(result.status);
    // Ο κωδικός μπαίνει στο μήνυμα επίτηδες: το 404 λέει "δεν είναι εκεί που το ψάχνουμε"
    // και το 500 "το Pod δυσκολεύεται" - χωρίς αυτόν, το ίδιο μήνυμα κρύβει δύο αιτίες.
    throw new Error(`Αποτυχία λήψης του αρχείου "${fileName}" (κωδικός ${result.status}).`);
  }

  return result.uri;
}

interface UpdatePodAclParams {
  activePatientFolderUrl: string;
  accessToken: string;
  accessList: any[];
  newDoctorWebId: string;
  accessType: string;
}

export async function updatePodAcl({
  activePatientFolderUrl,
  accessToken,
  accessList,
  newDoctorWebId,
  accessType,
}: UpdatePodAclParams): Promise<void> {
  // Παίρνουμε ΟΛΟΥΣ τους υπάρχοντες γιατρούς + τον νέο (ή, αν υπάρχει ήδη, με τον νέο τύπο)
  const alreadyExists = accessList.some(a => a.doctors?.web_id === newDoctorWebId);
  const allDoctors = alreadyExists
    ? accessList.map(a => a.doctors?.web_id === newDoctorWebId ? { ...a, access_type: accessType } : a)
    : [...accessList, { doctors: { web_id: newDoctorWebId }, access_type: accessType }];

  await syncPodAcl({ activePatientFolderUrl, accessToken, accessList: allDoctors });
}

interface SyncPodAclParams {
  activePatientFolderUrl: string;
  accessToken: string;
  accessList: any[];
}

// Ξαναγράφει το ACL του φακέλου ώστε να συμφωνεί με τη λίστα προσβάσεων της βάσης. Το
// καλούμε και μόνο του: όταν ο ασθενής δίνει πρόσβαση σε γιατρό που δεν έχει ακόμα WebID, ο
// γιατρός δεν μπορεί να μπει στο ACL - μπαίνει μόλις κάνει το πρώτο του Solid login και ο
// ασθενής ξανασυνδεθεί, αφού μόνο ο ίδιος ο ασθενής μπορεί να γράψει στο ACL του Pod του.
export async function syncPodAcl({
  activePatientFolderUrl,
  accessToken,
  accessList,
}: SyncPodAclParams): Promise<void> {
  const aclUrl = normalizePodUrl(`${activePatientFolderUrl}.acl`);

  let aclContent = `
  @prefix acl: <http://www.w3.org/ns/auth/acl#>.
  @prefix foaf: <http://xmlns.com/foaf/0.1/>.

  <#owner>
    a acl:Authorization;
    acl:agent <${getOwnerWebId(activePatientFolderUrl)}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read, acl:Write, acl:Control.
  `;

  // Οι γιατροί χωρίς WebID απλώς παραλείπονται - θα μπουν σε επόμενο συγχρονισμό. Όσοι έχουν
  // "Καμία Πρόσβαση" μένουν εκτός επίτηδες: η εγγραφή τους υπάρχει μόνο για να τη θυμάται ο
  // ασθενής, δεν δίνει κανένα δικαίωμα στον φάκελο.
  accessList.forEach((a, index) => {
    const webId = a.doctors?.web_id;
    if (!webId || !grantsPodAccess(a.access_type)) return;
    aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${webId}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${a.access_type === ACCESS_FULL ? ', acl:Write' : ''}.
  `;
  });

  const dpopToken = await createDpopToken('PUT', aclUrl);
  const response = await fetch(aclUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
    body: aclContent,
  });

  // Χωρίς αυτό, μια αποτυχημένη εγγραφή ACL (π.χ. σφάλμα server, ή χαμένη σύνδεση ενώ
  // περιμέναμε την απάντηση) περνούσε σιωπηλά ως επιτυχία: ο καλών δεν είχε κανέναν τρόπο να
  // ξέρει ότι ο γιατρός δεν απέκτησε (ή δεν έχασε) πρόσβαση στο Pod όπως νόμιζε η εφαρμογή.
  if (!response.ok) {
    throw new Error(`Αποτυχία ενημέρωσης δικαιωμάτων στο Pod (${response.status}).`);
  }
}

interface RemoveDoctorFromAclParams {
  activePatientFolderUrl: string;
  accessToken: string;
  accessList: any[];
  doctorWebId: string;
}

export async function removeDoctorFromAcl({
  activePatientFolderUrl,
  accessToken,
  accessList,
  doctorWebId,
}: RemoveDoctorFromAclParams): Promise<void> {
  const aclUrl = normalizePodUrl(`${activePatientFolderUrl}.acl`);

  // Πρώτα παίρνουμε τους υπόλοιπους γιατρούς που έχουν ακόμα πρόσβαση
  const remainingDoctors = accessList.filter(a => a.doctors?.web_id !== doctorWebId);

  let aclContent = `
  @prefix acl: <http://www.w3.org/ns/auth/acl#>.
  @prefix foaf: <http://xmlns.com/foaf/0.1/>.

  <#owner>
    a acl:Authorization;
    acl:agent <${getOwnerWebId(activePatientFolderUrl)}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read, acl:Write, acl:Control.
  `;

  remainingDoctors.forEach((a, index) => {
    if (a.doctors?.web_id && grantsPodAccess(a.access_type)) {
      aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${a.doctors.web_id}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${a.access_type === ACCESS_FULL ? ', acl:Write' : ''}.
  `;
    }
  });

  const dpopToken = await createDpopToken('PUT', aclUrl);
  const response = await fetch(aclUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
    body: aclContent,
  });

  if (response.ok) {
    console.log("✅ Η πρόσβαση αφαιρέθηκε από το Pod!");
  } else {
    console.error("❌ ACL error:", response.status, await response.text());
  }
}
