import { supabase } from './supabase';
import { ACCESS_FULL, ACCESS_READ_ONLY, ACCESS_NONE } from '../constants/accessTypes';
import { isFemale } from '../constants/medicalOptions';

// Ειδοποιήσεις για αλλαγές στην πρόσβαση, προς τον ασθενή ή τον γιατρό. Κρατάμε έτοιμο το
// κείμενο του μηνύματος: η ειδοποίηση δείχνει ό,τι ίσχυε τη στιγμή του γεγονότος, ακόμα κι αν
// αργότερα αλλάξουν τα στοιχεία ή η πρόσβαση.
export type NotificationRole = 'patient' | 'doctor';

// Πού πηγαίνει ο χρήστης όταν πατήσει την ειδοποίηση. Αποθηκεύεται ως JSON στη στήλη "link".
export type NotificationLink =
  | { type: 'access_requests' }
  | { type: 'patient_history'; patientAmka: string }
  | { type: 'record'; category: string; url: string };

export interface NotificationRecord {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
  link?: NotificationLink | null;
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

// Η αρχή της πρότασης με το σωστό γένος: "Ο Χ (Παθολόγος)" / "Η Χ (Παθολόγος)" - το γένος έρχεται από το
// φύλο που δήλωσε ο ίδιος στην εγγραφή του (όπως στο καλωσόρισμα των αρχικών οθονών).
async function doctorSubject(doctorAmka: string): Promise<string> {
  const { data } = await supabase.from('doctors').select('first_name, last_name, sex, specialty').eq('amka', doctorAmka).maybeSingle();
  if (!data) return 'Ένας χρήστης';
  const specialty = data.specialty ? ` (${data.specialty})` : '';
  return `${isFemale(data.sex) ? 'Η' : 'Ο'} ${data.first_name} ${data.last_name}${specialty}`;
}

async function patientSubject(patientAmka: string): Promise<string> {
  const { data } = await supabase.from('patients').select('first_name, last_name, sex').eq('amka', patientAmka).maybeSingle();
  if (!data) return 'Ένας χρήστης';
  return `${isFemale(data.sex) ? 'Η' : 'Ο'} ${data.first_name} ${data.last_name}`;
}

// Η ειδοποίηση είναι δευτερεύουσα: αν αποτύχει να γραφτεί, η ίδια η ενέργεια (αίτημα, πρόσβαση)
// έχει ήδη γίνει και δεν πρέπει ποτέ να εμφανιστεί ως αποτυχημένη γι' αυτόν τον λόγο. Γι' αυτό
// κάθε notify* καταπίνει τα σφάλματα.
async function createNotification(role: NotificationRole, recipientAmka: string, message: string, link?: NotificationLink): Promise<void> {
  const base = { recipient_role: role, recipient_amka: recipientAmka, message };
  let { error } = await supabase.from('notifications').insert([link ? { ...base, link } : base]);
  // Αν λείπει η στήλη "link" από τον πίνακα, γράφουμε την ειδοποίηση χωρίς σύνδεσμο αντί να τη χάσουμε.
  if (error && link) ({ error } = await supabase.from('notifications').insert([base]));
  // Δεν το δείχνουμε στον χρήστη, αλλά μένει στο log για όποιον διορθώνει (π.χ. λείπει ο πίνακας ή η πολιτική RLS).
  if (error) console.error('Αποτυχία δημιουργίας ειδοποίησης:', error.message);
}

// --- Ενέργειες γιατρού, ειδοποίηση προς τον ασθενή ---

export async function notifyAccessRequested(patientAmka: string, doctorAmka: string, accessType: string) {
  try {
    const subject = await doctorSubject(doctorAmka);
    await createNotification('patient', patientAmka, `${subject} ζήτησε ${accessTypeAsObject(accessType)} στον ιατρικό σας φάκελο.`, { type: 'access_requests' });
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

// --- Αλλαγές στον φάκελο του ασθενή από γιατρό, ειδοποίηση προς τον ασθενή ---

export type RecordChange = 'added' | 'edited' | 'retracted' | 'restored';

// Το ρήμα κάθε αλλαγής, με το ουσιαστικό της κατηγορίας στη σωστή πτώση και γένος.
const RECORD_CHANGE_TEXT: Record<string, Record<RecordChange, string>> = {
  'Διαγνώσεις': { added: 'πρόσθεσε νέα διάγνωση', edited: 'τροποποίησε τη διάγνωση', retracted: 'ανακάλεσε τη διάγνωση', restored: 'αναίρεσε την ανάκληση της διάγνωσης' },
  'Εξετάσεις': { added: 'πρόσθεσε νέα εξέταση', edited: 'τροποποίησε την εξέταση', retracted: 'ανακάλεσε την εξέταση', restored: 'αναίρεσε την ανάκληση της εξέτασης' },
  'Φάρμακα': { added: 'πρόσθεσε νέο φάρμακο', edited: 'τροποποίησε το φάρμακο', retracted: 'ανακάλεσε το φάρμακο', restored: 'αναίρεσε την ανάκληση του φαρμάκου' },
  'Αλλεργίες': { added: 'πρόσθεσε νέα αλλεργία', edited: 'τροποποίησε την αλλεργία', retracted: 'ανακάλεσε την αλλεργία', restored: 'αναίρεσε την ανάκληση της αλλεργίας' },
  'Νοσηλείες': { added: 'πρόσθεσε νέα νοσηλεία', edited: 'τροποποίησε τη νοσηλεία', retracted: 'ανακάλεσε τη νοσηλεία', restored: 'αναίρεσε την ανάκληση της νοσηλείας' },
  'Εμβολιασμοί': { added: 'πρόσθεσε νέο εμβολιασμό', edited: 'τροποποίησε τον εμβολιασμό', retracted: 'ανακάλεσε τον εμβολιασμό', restored: 'αναίρεσε την ανάκληση του εμβολιασμού' },
};

// Ειδοποιεί τον ασθενή ότι ο γιατρός άλλαξε κάτι στον φάκελό του. Όταν ο γιατρός και ο ασθενής
// είναι το ίδιο πρόσωπο (ίδιο ΑΜΚΑ, βλ. σύνδεση με δύο ρόλους) δεν υπάρχει τίποτα να μάθει.
export async function notifyRecordChange(patientAmka: string, doctorAmka: string, category: string, change: RecordChange, title?: string, url?: string) {
  if (!patientAmka || patientAmka === doctorAmka) return;
  const verb = RECORD_CHANGE_TEXT[category]?.[change];
  if (!verb) return;
  try {
    const subject = await doctorSubject(doctorAmka);
    const detail = title ? `: ${title}` : '';
    await createNotification('patient', patientAmka, `${subject} ${verb}${detail}.`, url ? { type: 'record', category, url } : undefined);
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

// --- Ενέργειες ασθενή, ειδοποίηση προς τον γιατρό ---

export async function notifyAccessGranted(doctorAmka: string, patientAmka: string, accessType: string) {
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} σας έδωσε ${accessTypeAsObject(accessType)} στον ιατρικό του φάκελο.`, { type: 'patient_history', patientAmka });
  } catch {
    // Βλ. σχόλιο στο createNotification.
  }
}

export async function notifyAccessChanged(doctorAmka: string, patientAmka: string, newType: string) {
  if (newType === ACCESS_NONE) return notifyAccessRevoked(doctorAmka, patientAmka);
  try {
    const subject = await patientSubject(patientAmka);
    await createNotification('doctor', doctorAmka, `${subject} άλλαξε την πρόσβασή σας σε ${accessTypeAsObject(newType)}.`, { type: 'patient_history', patientAmka });
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

  const query = (columns: string) => supabase
    .from('notifications')
    .select(columns)
    .eq('recipient_role', role)
    .eq('recipient_amka', recipientAmka)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const withLink = await query('id, message, read, created_at, link');
  if (!withLink.error) return withLink as unknown as { data: NotificationRecord[] | null; error: any };
  // Αν λείπει η στήλη "link", διαβάζουμε χωρίς αυτήν: οι ειδοποιήσεις φαίνονται, απλώς δεν πατιούνται.
  return await query('id, message, read, created_at') as unknown as { data: NotificationRecord[] | null; error: any };
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
