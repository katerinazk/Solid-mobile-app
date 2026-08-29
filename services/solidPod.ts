import * as FileSystem from 'expo-file-system/legacy';
import { createDpopToken } from '../utils/dpop';

// Ανακατασκευάζει το WebID του ασθενή-ιδιοκτήτη από το URL του δημόσιου φακέλου του
// (αντίστροφος μετασχηματισμός του webId.replace('profile/card#me', 'public/') στο AuthContext).
function getOwnerWebId(folderUrl: string): string {
  return folderUrl.replace('public/', 'profile/card#me');
}

export function getPublicFolderUrl(webId: string): string {
  return webId.replace('profile/card#me', 'public/');
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
    throw new Error('Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.');
  }

  const text = await response.text();

  // Ισοπεδώνουμε τα newlines ώστε να πιάνουμε και πολυγραμμικές λίστες
  const flatText = text.replace(/\r?\n\s*/g, ' ');
  const fileUrls: string[] = [];
  // Βρίσκουμε κάθε ldp:contains block (μπορεί να έχει πολλά URLs με κόμμα)
  for (const containsMatch of flatText.matchAll(/ldp:contains\s+((?:<[^>]+>(?:\s*,\s*)?)+)/g)) {
    for (const uriMatch of containsMatch[1].matchAll(/<([^>]+)>/g)) {
      const uri = uriMatch[1];
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

export async function fetchFileContent(url: string, accessToken: string): Promise<string> {
  const dpopToken = await createDpopToken('GET', url);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
  });

  if (!response.ok) {
    throw new Error('Δεν ήταν δυνατή η ανάγνωση του αρχείου.');
  }

  return response.text();
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
    throw new Error('Σφάλμα διαγραφής: ' + response.status);
  }
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
  const aclUrl = `${activePatientFolderUrl}.acl`;

  // Παίρνουμε ΟΛΟΥΣ τους υπάρχοντες γιατρούς + τον νέο
  let allDoctors = [...accessList];

  // Αν ο γιατρός δεν υπάρχει ήδη στη λίστα, τον προσθέτουμε προσωρινά
  const alreadyExists = allDoctors.some(a => a.doctors?.web_id === newDoctorWebId);
  if (!alreadyExists) {
    allDoctors = [...allDoctors, {
      doctors: { web_id: newDoctorWebId },
      access_type: accessType
    }];
  }

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

  // Προσθέτουμε ΟΛΟΥΣ τους γιατρούς
  allDoctors.forEach((a, index) => {
    const webId = a.doctors?.web_id;
    if (!webId) return;
    const type = webId === newDoctorWebId ? accessType : a.access_type;
    aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${webId}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${type === 'Πλήρης Πρόσβαση' ? ', acl:Write' : ''}.
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
    if (a.doctors?.web_id) {
      aclContent += `
  <#doctor${index}>
    a acl:Authorization;
    acl:agent <${a.doctors.web_id}>;
    acl:accessTo <${activePatientFolderUrl}>;
    acl:default <${activePatientFolderUrl}>;
    acl:mode acl:Read${a.access_type === 'Πλήρης Πρόσβαση' ? ', acl:Write' : ''}.
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
