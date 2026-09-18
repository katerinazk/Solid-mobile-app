import * as FileSystem from 'expo-file-system/legacy';
import { createDpopToken } from '../utils/dpop';
import { takeListing, takeContent } from '../utils/podPrefetchStore';
import { ACCESS_FULL, grantsPodAccess } from '../constants/accessTypes';

// Ανακατασκευάζει το WebID του ασθενή-ιδιοκτήτη από το URL του δημόσιου φακέλου του
// (αντίστροφος μετασχηματισμός του webId.replace('profile/card#me', 'public/') στο AuthContext).
export function getOwnerWebId(folderUrl: string): string {
  return folderUrl.replace('public/', 'profile/card#me');
}

export function getPublicFolderUrl(webId: string): string {
  return webId.replace('profile/card#me', 'public/');
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
export const HISTORY_CATEGORIES = ['Διαγνώσεις', 'Εξετάσεις', 'Φάρμακα', 'Αλλεργίες', 'Νοσηλίες', 'Εμβολιασμοί'];

export function getCategoryFolderUrl(webId: string, category: string): string {
  return `${getPublicFolderUrl(webId)}${MEDPOD_FOLDER_NAME}/${encodeURIComponent(category)}/`;
}

// Δεν δημιουργούμε πια προληπτικά τους φακέλους κατηγοριών (π.χ. με ένα κενό .keep αρχείο).
// Κάθε φάκελος κατηγορίας δημιουργείται αυτόματα από τον ίδιο τον Solid server ως side effect
// του πρώτου πραγματικού saveFileContent (PUT) μέσα του - το ίδιο μοτίβο και για τις 6
// κατηγορίες. Μέχρι τότε, μια οθόνη ιστορικού απλά βλέπει ότι ο φάκελος δεν υπάρχει ακόμα.

export async function listFolderFiles(folderUrl: string, accessToken: string): Promise<string[]> {
  // Αν ο κατάλογος προφορτώθηκε στη σύνδεση, απαντάμε από τη μνήμη χωρίς αίτημα.
  const prefetchedFiles = takeListing(folderUrl);
  if (prefetchedFiles) return prefetchedFiles;

  // ΠΡΟΣΩΡΙΝΟ: χωρίζει τον χρόνο υπογραφής από τον χρόνο δικτύου, για να φανεί ποιος φταίει.
  const tSign = Date.now();
  const dpopToken = await createDpopToken('GET', folderUrl);
  const signMs = Date.now() - tSign;
  const tNet = Date.now();
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
  if (__DEV__) console.log(`[ΧΡΟΝΟΣ] κατάλογος: υπογραφή ${signMs}ms, δίκτυο ${Date.now() - tNet}ms`);

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
    // ΠΡΟΣΩΡΙΝΟ: φαίνεται αν χτυπάει η διαδρομή αποτυχίας, που κοιμάται 800ms πριν ξαναδοκιμάσει.
    if (__DEV__) console.log('[ΧΡΟΝΟΣ] κατάλογος ΑΠΕΤΥΧΕ, ακολουθεί αναμονή 800ms');
  }

  try {
    // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await listFolderFiles(folderUrl, accessToken);
  } catch (error) {
    if (isPodAccessDenied(error)) throw error;
    // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - δημιουργείται με την πρώτη καταχώρηση.
    return [];
  }
}

export async function fetchFileContent(url: string, accessToken: string): Promise<string> {
  // Το ίδιο και για το περιεχόμενο: προφορτωμένο αρχείο δεν ξανακατεβαίνει.
  const prefetchedText = takeContent(url);
  if (prefetchedText !== undefined) return prefetchedText;

  // ΠΡΟΣΩΡΙΝΟ: χωρίζει τον χρόνο υπογραφής από τον χρόνο δικτύου, για να φανεί ποιος φταίει.
  const tSign = Date.now();
  const dpopToken = await createDpopToken('GET', url);
  const signMs = Date.now() - tSign;
  const tNet = Date.now();
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
  if (__DEV__) console.log(`[ΧΡΟΝΟΣ] αρχείο: υπογραφή ${signMs}ms, δίκτυο ${Date.now() - tNet}ms`);
  return text;
}

export async function deleteFile(url: string, accessToken: string): Promise<void> {
  const dpopToken = await createDpopToken('DELETE', url);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (!response.ok) {
    throwIfAccessDenied(response.status);
    throw new Error('Σφάλμα διαγραφής: ' + response.status);
  }
}

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
// Η συμπλήρωση με μηδενικά είναι απαραίτητη: μια νοσηλία του 1995 δίνει δωδεκαψήφια χιλιοστά
// και δεν θα την έβρισκε ο δεκατριαψήφιος αναγνώστης. Ημερομηνίες πριν το 1970 δίνουν αρνητικό
// αριθμό και κρατούν το πρόσημό τους: αν τις μηδενίζαμε, μια νοσηλία του 1965 θα διαβαζόταν ως
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

export async function saveFileContent(url: string, accessToken: string, content: string): Promise<void> {
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

// Ο φάκελος συνημμένων αρχείων μιας συγκεκριμένης εγγραφής (π.χ. μιας νοσηλίας) -
// παράγεται από το URL του ίδιου του .json αρχείου της εγγραφής, ώστε τα αρχεία
// να συνδέονται αυτόματα μαζί της χωρίς επιπλέον μεταδεδομένα.
export function getAttachmentsFolderUrl(recordUrl: string): string {
  return recordUrl.replace(/\.json$/, '') + '_files/';
}

export async function uploadAttachment(
  recordUrl: string,
  fileName: string,
  localUri: string,
  mimeType: string,
  accessToken: string
): Promise<void> {
  const fileUrl = `${getAttachmentsFolderUrl(recordUrl)}${encodeURIComponent(fileName)}`;
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
    throw new Error(`Αποτυχία μεταφόρτωσης του αρχείου "${fileName}" (κωδικός ${result.status}).`);
  }
}

// Κατεβάζει ένα συνημμένο αρχείο τοπικά (cache) ώστε να μπορεί να ανοιχτεί/μοιραστεί
// με το Sharing API. Επιστρέφει το τοπικό file:// URI.
export async function downloadAttachment(
  recordUrl: string,
  fileName: string,
  accessToken: string
): Promise<string> {
  const fileUrl = `${getAttachmentsFolderUrl(recordUrl)}${encodeURIComponent(fileName)}`;
  const localUri = `${FileSystem.cacheDirectory}${fileName}`;
  const dpopToken = await createDpopToken('GET', fileUrl);
  const result = await FileSystem.downloadAsync(fileUrl, localUri, {
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (result.status < 200 || result.status >= 300) {
    throwIfAccessDenied(result.status);
    throw new Error(`Αποτυχία λήψης του αρχείου "${fileName}".`);
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
  const aclUrl = `${activePatientFolderUrl}.acl`;

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

  if (response.ok) {
    console.log("✅ ACL ενημερώθηκε στο Pod!");
  } else {
    console.error("❌ ACL error:", response.status, await response.text());
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
  const aclUrl = `${activePatientFolderUrl}.acl`;

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
