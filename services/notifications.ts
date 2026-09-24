import { supabase } from './supabase';
import { ACCESS_FULL, ACCESS_READ_ONLY, ACCESS_NONE } from '../constants/accessTypes';
import { isFemale } from '../constants/medicalOptions';

// Ειδοποιήσεις για αλλαγές στην πρόσβαση, προς τον ασθενή ή τον γιατρό. Κρατάμε έτοιμο το
// κείμενο του μηνύματος: η ειδοποίηση δείχνει ό,τι ίσχυε τη στιγμή του γεγονότος, ακόμα κι αν
// αργότερα αλλάξουν τα στοιχεία ή η πρόσβαση.
export type NotificationRole = 'patient' | 'doctor';

export interface NotificationRecord {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
}

// Μετά από τόσες μέρες η ειδοποίηση σβήνεται.
const NOTIFICATION_TTL_DAYS = 30;
// Πόσες ειδοποιήσεις φέρνει μία ανάγνωση, αν δεν ζητηθεί άλλο μέγεθος (η αρχική οθόνη).
export const DEFAULT_PAGE_SIZE = 30;

// Ο τύπος πρόσβασης σε πτώση αιτιατικής, ώστε να διαβάζεται σαν πρόταση ("ζήτησε Πλήρη Πρόσβαση").
function accessTypeAsObject(accessType: string): string {
  if (accessType === ACCESS_FULL) return 'Πλήρη Πρόσβαση';
  if (accessType === ACCESS_READ_ONLY) return 'Πρόσβαση Μόνο Ανάγνωσης';
  if (accessType === ACCESS_NONE) return 'Καμία Πρόσβαση';
  return accessType;
}

// Η αρχή της πρότασης με το σωστό γένος: "Ο γιατρός Χ" / "Η γιατρός Χ" - το γένος έρχεται από το
// φύλο που δήλωσε ο ίδιος στην εγγραφή του (όπως στο καλωσόρισμα των αρχικών οθονών).
async function doctorSubject(doctorAmka: string): Promise<string> {
  const { data } = await supabase.from('doctors').select('first_name, last_name, sex').eq('amka', doctorAmka).maybeSingle();
  if (!data) return 'Ένας γιατρός';
  return `${isFemale(data.sex) ? 'Η' : 'Ο'} γιατρός ${data.first_name} ${data.last_name}`;
}

async function patientSubject(patientAmka: string): Promise<string> {
  const { data } = await supabase.from('patients').select('first_name, last_name, sex').eq('amka', patientAmka).maybeSingle();
  if (!data) return 'Ένας ασθενής';
  return `${isFemale(data.sex) ? 'Η' : 'Ο'} ασθενής ${data.first_name} ${data.last_name}`;
}

// Η ειδοποίηση είναι δευτερεύουσα: αν αποτύχει να γραφτεί, η ίδια η ενέργεια (αίτημα, πρόσβαση)
// έχει ήδη γίνει και δεν πρέπει ποτέ να εμφανιστεί ως αποτυχημένη γι' αυτόν τον λόγο. Γι' αυτό
// κάθε notify* καταπίνει τα σφάλματα.
async function createNotification(role: NotificationRole, recipientAmka: string, message: string): Promise<void> {
  const { error } = await supabase.from('notifications').insert([{ recipient_role: role, recipient_amka: recipientAmka, message }]);
  // Δεν το δείχνουμε στον χρήστη, αλλά μένει στο log για όποιον διορθώνει (π.χ. λείπει ο πίνακας ή η πολιτική RLS).
  if (error) console.error('Αποτυχία δημιουργίας ειδοποίησης:', error.message);
}

// --- Ενέργειες γιατρού, ειδοποίηση προς τον ασθενή ---

export async function notifyAccessRequested(patientAmka: string, doctorAmka: string, accessType: string) {
  try {
    const subject = await doctorSubject(doctorAmka);
    await createNotification('patient', patientAmka, `${subject} ζήτησε ${accessTypeAsObject(accessType)} στον ιατρικό σας φάκελο.`);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

// --- Ενέργειες ασθενή, ειδοποίηση προς τον γιατρό ---

export async function notifyAccessGranted(doctorAmka: string, patientAmka: string, accessType: string) {
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} σας έδωσε ${accessTypeAsObject(accessType)} στον ιατρικό του φάκελο.`);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

export async function notifyAccessChanged(doctorAmka: string, patientAmka: string, newType: string) {
  if (newType === ACCESS_NONE) return notifyAccessRevoked(doctorAmka, patientAmka);
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} άλλαξε την πρόσβασή σας σε ${accessTypeAsObject(newType)}.`);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

export async function notifyAccessRevoked(doctorAmka: string, patientAmka: string) {
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} κατήργησε την πρόσβασή σας στον ιατρικό του φάκελο.`);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

export async function notifyRequestRejected(doctorAmka: string, patientAmka: string) {
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} απέρριψε το αίτημα πρόσβασής σας.`);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

// --- Ανάγνωση και διαχείριση από τον παραλήπτη ---

export async function fetchNotifications(role: NotificationRole, recipientAmka: string, offset = 0, limit = DEFAULT_PAGE_SIZE) {
  const cutoff = new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Καθαρίζουμε τις ληγμένες του ίδιου του παραλήπτη, μόνο στην πρώτη σελίδα - αν αποτύχει, το
  // φίλτρο παρακάτω τις κρύβει ούτως ή άλλως.
  if (offset === 0) {
    await supabase
      .from('notifications')
      .delete()
      .eq('recipient_role', role)
      .eq('recipient_amka', recipientAmka)
      .lt('created_at', cutoff);
  }

  return supabase
    .from('notifications')
    .select('id, message, read, created_at')
    .eq('recipient_role', role)
    .eq('recipient_amka', recipientAmka)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
}

// Οι ειδοποιήσεις που ο χρήστης βλέπει για πρώτη φορά σε αυτή τη σύνδεση - παίρνουν την κουκκίδα
// "νέο". Στη βάση μαρκάρονται αμέσως ως διαβασμένες, οπότε στην επόμενη σύνδεση δεν θα είναι
// πια νέες· εδώ, μόνο στη μνήμη, κρατάμε ποιες ήταν νέες μέχρι να αποσυνδεθεί.
const newNotificationIds = new Set<string>();

export function isNewNotification(id: string): boolean {
  return newNotificationIds.has(id);
}

export function clearNewNotificationMarks() {
  newNotificationIds.clear();
}

export async function markNotificationsAsSeen(ids: string[]) {
  if (ids.length === 0) return;
  ids.forEach((id) => newNotificationIds.add(id));
  await supabase.from('notifications').update({ read: true }).in('id', ids);
}
