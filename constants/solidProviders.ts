// Οι πάροχοι Pod που μπορεί να διαλέξει ο χρήστης στη σύνδεση.
//
// Η λίστα βγαίνει από το επίσημο μητρώο του Solid Project (solidproject.org/get_a_pod), αλλά
// ΔΕΝ είναι αντιγραφή του: κρατήθηκαν όσοι πληρούν τις τρεις προϋποθέσεις που έχει η εφαρμογή.
//
// 1. Δυναμική εγγραφή πελάτη (DCR). Η εφαρμογή δεν έχει σταθερό client id - γράφεται μόνη της
//    στον πάροχο τη στιγμή της σύνδεσης. Χωρίς "registration_endpoint" στο discovery, σταματά.
// 2. WebID της μορφής <pod>/profile/card#me. Από αυτό βγαίνει ο φάκελος του ιστορικού, με
//    αντικατάσταση του "profile/card#me" από "public/". Το ίδιο ισχύει και στον node-solid-server
//    και στον Community Solid Server, οπότε καλύπτονται και οι δύο οικογένειες.
// 3. Έλεγχος πρόσβασης με WAC, δηλαδή αρχεία .acl. Έτσι γράφει η εφαρμογή τις προσβάσεις των
//    γιατρών στον φάκελο του ασθενή.
//
// Μένουν έξω, με τον λόγο τους:
// - Inrupt Pod Spaces: WebID μορφής https://id.inrupt.com/όνομα (το Pod ζει σε άλλον host) και
//   έλεγχος πρόσβασης με ACP αντί για WAC. Θα χρειαζόταν δεύτερη υλοποίηση προσβάσεων.
// - Trinpod (trinpod.eu/us): το discovery είναι εντάξει και υποστηρίζει DCR, αλλά είναι δική
//   του υλοποίηση και η μορφή του WebID δεν επιβεβαιώθηκε.
// - brolly.id, use.id, solidweb.app: δεν απάντησαν με discovery document στη διεύθυνση του
//   μητρώου, οπότε δεν υπάρχει τρόπος να γίνει η δυναμική εγγραφή.
//
// Η περιοχή φιλοξενίας δεν είναι διακοσμητική σε εφαρμογή ιατρικού φακέλου: δείχνει σε ποιο
// νομικό καθεστώς κάθονται τα δεδομένα. Γι' αυτό γράφεται δίπλα στο όνομα.
export interface SolidProvider {
  name: string;
  url: string;
  region: string;
}

export const SOLID_PROVIDERS: SolidProvider[] = [
  { name: 'Data Pod', url: 'https://datapod.igrant.io', region: 'ΕΕ' },
  { name: 'redpencil.io', url: 'https://solid.redpencil.io', region: 'ΕΕ' },
  { name: 'solidweb.me', url: 'https://solidweb.me', region: 'ΕΕ' },
  { name: 'solidweb.org', url: 'https://solidweb.org', region: 'ΕΕ' },
  { name: 'teamid.live', url: 'https://teamid.live', region: 'ΕΕ' },
  { name: 'solidcommunity.net', url: 'https://solidcommunity.net', region: 'Ην. Βασίλειο' },
  { name: 'privatedatapod.com', url: 'https://privatedatapod.com', region: 'ΗΠΑ' },
  { name: 'solidcommunity.au', url: 'https://pods.solidcommunity.au', region: 'Αυστραλία' },
];

// Ο προεπιλεγμένος πάροχος: ο πρώτος της λίστας.
export const DEFAULT_SOLID_PROVIDER_URL = SOLID_PROVIDERS[0].url;

// Αυτό διαβάζει ο χρήστης στη λίστα. Η διεύθυνση δεν εμφανίζεται: δεν του λέει τίποτα, και το
// ζητούμενο είναι να διαλέξει πάροχο, όχι να πληκτρολογήσει URL.
export function solidProviderLabel(provider: SolidProvider): string {
  return `${provider.name} (${provider.region})`;
}

export const SOLID_PROVIDER_OPTIONS = SOLID_PROVIDERS.map(solidProviderLabel);

export function solidProviderUrlFromLabel(label: string): string {
  const found = SOLID_PROVIDERS.find((provider) => solidProviderLabel(provider) === label);
  return found ? found.url : DEFAULT_SOLID_PROVIDER_URL;
}

// Η αντίστροφη διαδρομή, για να δείχνει η λίστα τον ήδη επιλεγμένο πάροχο. Μια διεύθυνση εκτός
// λίστας - από παλιότερη εκδοχή της εφαρμογής - δεν αντιστοιχεί σε επιλογή και μένει κενή.
export function solidProviderLabelFromUrl(url: string): string {
  const found = SOLID_PROVIDERS.find((provider) => provider.url === url);
  return found ? solidProviderLabel(found) : '';
}

// Ανήκει το WebID σε αυτόν τον πάροχο; Ο host του WebID είναι είτε ο ίδιος με του παρόχου
// (solidweb.me/όνομα/...) είτε υποτομέας του (όνομα.solidcommunity.net). Στους παρόχους με
// πρόθεμα "pods." ο υποτομέας είναι του βασικού.
export function webIdBelongsToProvider(webId: string, providerUrl: string): boolean {
  try {
    const host = new URL(webId).hostname;
    const providerHost = new URL(providerUrl).hostname;
    return [providerHost, providerHost.replace(/^pods\./, '')].some((base) => host === base || host.endsWith('.' + base));
  } catch {
    return false;
  }
}

// Ο πάροχος της λίστας στον οποίο ανήκει ένα WebID, ή null αν δεν ανήκει σε κανέναν.
export function solidProviderForWebId(webId: string): SolidProvider | null {
  return SOLID_PROVIDERS.find((provider) => webIdBelongsToProvider(webId, provider.url)) || null;
}

// Αν το ΑΜΚΑ είναι ήδη δεμένο με Pod και ο χρήστης διάλεξε άλλον πάροχο, επιστρέφει το μήνυμα
// που τον εμποδίζει. Αλλιώς null (και όταν το Pod δεν αντιστοιχεί σε πάροχο της λίστας - τότε
// αποφασίζει ο έλεγχος μετά τη σύνδεση).
export function providerMismatchMessage(boundWebId: string | null | undefined, chosenProviderUrl: string): string | null {
  if (!boundWebId) return null;
  const bound = solidProviderForWebId(boundWebId);
  if (!bound || webIdBelongsToProvider(boundWebId, chosenProviderUrl)) return null;
  return `Το ΑΜΚΑ σας είναι συνδεδεμένο με τον πάροχο ${solidProviderLabel(bound)}. Επιλέξτε τον ίδιο πάροχο, ή αλλάξτε Pod από τον Λογαριασμό σας μετά τη σύνδεση.`;
}
