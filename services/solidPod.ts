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

async function folderExists(folderUrl: string, accessToken: string): Promise<boolean> {
  const dpopToken = await createDpopToken('GET', folderUrl);
  const response = await fetch(folderUrl, {
    method: 'GET',
    headers: {
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
      'Accept': 'text/turtle',
    },
  });
  return response.ok;
}

// Δημιουργεί το φάκελο βάζοντας ένα κενό αρχείο-δείκτη μέσα του· οι Solid servers
// δημιουργούν αυτόματα τον ίδιο τον φάκελο (τον άμεσο γονέα του marker) όταν κάνουμε
// PUT σε μια διαδρομή που δεν υπάρχει ακόμα.
async function createFolder(folderUrl: string, accessToken: string): Promise<void> {
  const markerUrl = `${folderUrl}.keep`;
  const dpopToken = await createDpopToken('PUT', markerUrl);
  await fetch(markerUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Authorization': `DPoP ${accessToken}`,
      'DPoP': dpopToken,
    },
    body: '',
  });
}

// Δημιουργεί τον φάκελο μιας συγκεκριμένης κατηγορίας αν δεν υπάρχει ήδη - μπορεί να
// κληθεί οποτεδήποτε (π.χ. από μια οθόνη ιστορικού όταν ανοίγει), όχι μόνο κατά το login.
export async function ensureCategoryFolder(webId: string, category: string, accessToken: string): Promise<void> {
  const categoryUrl = getCategoryFolderUrl(webId, category);
  if (!(await folderExists(categoryUrl, accessToken))) {
    await createFolder(categoryUrl, accessToken);
  }
}

// Καλείται κατά τη σύνδεση του ασθενή· φτιάχνει (αν λείπουν) τον φάκελο MedPod/ και τους
// 6 υποφακέλους κατηγοριών ιστορικού, ώστε να είναι οργανωμένα από την αρχή τόσο για τον
// ασθενή όσο και για τους γιατρούς που προσθέτουν νέο ιστορικό. Φτιάχνουμε πρώτα το ίδιο
// το MedPod/ (ξεχωριστό βήμα) ώστε κάθε PUT να χρειάζεται να δημιουργήσει το πολύ έναν
// ενδιάμεσο φάκελο τη φορά, αντί να βασιζόμαστε στο αν ο server δημιουργεί αυτόματα
// πολλαπλά επίπεδα φακέλων ταυτόχρονα.
export async function ensureMedPodStructure(webId: string, accessToken: string): Promise<void> {
  const medPodUrl = `${getPublicFolderUrl(webId)}${MEDPOD_FOLDER_NAME}/`;
  if (!(await folderExists(medPodUrl, accessToken))) {
    await createFolder(medPodUrl, accessToken);
  }

  for (const category of HISTORY_CATEGORIES) {
    await ensureCategoryFolder(webId, category, accessToken);
  }
}

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
