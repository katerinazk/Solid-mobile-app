import { createDpopToken } from '../utils/dpop';

// Ο πραγματικός WebID του ασθενή-ιδιοκτήτη, όπως χρησιμοποιείται στο acl:agent του owner authorization.
const PATIENT_WEB_ID = 'https://up1072722vol2.datapod.igrant.io/profile/card#me';

export async function listFolderFiles(webId: string, accessToken: string): Promise<string[]> {
  const folderUrl = webId.replace('profile/card#me', 'public/');

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
    acl:agent <${PATIENT_WEB_ID}>;
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
    acl:agent <${PATIENT_WEB_ID}>;
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
