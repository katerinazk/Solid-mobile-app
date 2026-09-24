import { supabase } from './supabase';
import { notifyAccessRequested } from './notifications';

// Ένα αίτημα πρόσβασης που στέλνει ο γιατρός σε έναν ασθενή - παραμένει "pending" μέχρι ο
// ίδιος ο ασθενής να το εγκρίνει από τη δική του οθόνη "Αιτήματα" (γίνεται εκεί γιατί μόνο ο
// ασθενής, μέσω του δικού του Solid login, μπορεί να γράψει στο ACL του Pod του).
export interface AccessRequestRecord {
  id: string;
  doctor_amka: string;
  patient_amka: string;
  access_type: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

// Ένα αίτημα που δεν απαντήθηκε μέσα σε τόσες μέρες θεωρείται ληγμένο: ο ασθενής δεν το βλέπει
// πια και δεν μπορεί να το εγκρίνει, ώστε να μη δοθεί πρόσβαση σε ιατρικά δεδομένα με βάση
// ένα παλιό αίτημα που κανείς δεν θυμάται. Ο έλεγχος γίνεται στον κώδικα, όχι στη βάση.
export const ACCESS_REQUEST_TTL_DAYS = 30;

function requestCutoffIso(): string {
  return new Date(Date.now() - ACCESS_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function isAccessRequestExpired(createdAt: string): boolean {
  return new Date(createdAt).getTime() < Date.now() - ACCESS_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function hasPendingAccessRequest(doctorAmka: string, patientAmka: string) {
  return supabase
    .from('access_requests')
    .select('id, access_type')
    .eq('doctor_amka', doctorAmka)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending')
    .gte('created_at', requestCutoffIso())
    .maybeSingle();
}

// Όταν ο ασθενής δώσει με το χέρι ακριβώς τον τύπο που είχε ζητήσει ο γιατρός, το αίτημα έχει
// ουσιαστικά ικανοποιηθεί - το κλείνουμε ως αποδεκτό αντί να μένει εκκρεμές. Αν ο τύπος διαφέρει
// από τον ζητούμενο, το αίτημα μένει: ο γιατρός ζήτησε κάτι άλλο και ο ασθενής μπορεί ακόμα να απαντήσει.
export async function resolveMatchingAccessRequest(doctorAmka: string, patientAmka: string, accessType: string) {
  return supabase
    .from('access_requests')
    .update({ status: 'accepted' })
    .eq('doctor_amka', doctorAmka)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending')
    .eq('access_type', accessType)
    .gte('created_at', requestCutoffIso());
}

export async function createAccessRequest(doctorAmka: string, patientAmka: string, accessType: string) {
  // Αν το προηγούμενο αίτημα προς τον ίδιο ασθενή έχει λήξει, το καθαρίζουμε πριν μπει το νέο.
  await supabase
    .from('access_requests')
    .delete()
    .eq('doctor_amka', doctorAmka)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending')
    .lt('created_at', requestCutoffIso());

  const result = await supabase.from('access_requests').insert([{
    doctor_amka: doctorAmka,
    patient_amka: patientAmka,
    access_type: accessType,
    status: 'pending',
  }]);
  if (!result.error) await notifyAccessRequested(patientAmka, doctorAmka, accessType);
  return result;
}

export async function fetchPendingAccessRequestsForPatient(patientAmka: string) {
  return supabase
    .from('access_requests')
    .select(`
      id,
      doctor_amka,
      access_type,
      status,
      created_at,
      doctors (first_name, last_name, specialty, web_id)
    `)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending')
    .gte('created_at', requestCutoffIso());
}

export async function fetchPendingAccessRequestsForDoctor(doctorAmka: string) {
  return supabase
    .from('access_requests')
    .select(`
      id,
      patient_amka,
      access_type,
      status,
      created_at,
      patients (first_name, last_name)
    `)
    .eq('doctor_amka', doctorAmka)
    .eq('status', 'pending');
}

// Τα ληγμένα αιτήματα ο γιατρός τα βλέπει μία φορά (με μήνυμα "Έληξε") και μετά σβήνονται, ώστε
// να μη μαζεύονται στη λίστα του. Το φίλτρο status/created_at ξαναελέγχεται εδώ ώστε να μη
// διαγραφεί ποτέ αίτημα που στο μεταξύ απαντήθηκε.
export async function deleteExpiredAccessRequestsForDoctor(requestIds: string[]) {
  if (requestIds.length === 0) return { error: null };
  return supabase
    .from('access_requests')
    .delete()
    .in('id', requestIds)
    .eq('status', 'pending')
    .lt('created_at', requestCutoffIso());
}

// Ο γιατρός ακυρώνει ένα δικό του αίτημα πριν προλάβει ο ασθενής να απαντήσει - το διαγράφουμε
// εντελώς (δεν είναι έκβαση σαν το accepted/rejected, απλώς ποτέ δεν έφτασε σε απόφαση).
export async function cancelAccessRequest(requestId: string) {
  return supabase
    .from('access_requests')
    .delete()
    .eq('id', requestId);
}

// Ο ασθενής αποδέχεται ή απορρίπτει ένα αίτημα - κρατάμε την εγγραφή (με νέο status) αντί να
// τη διαγράφουμε, ώστε να μη μπορεί ο γιατρός να ξαναστείλει το ίδιο αίτημα επ' άπειρον χωρίς
// να το προσέξει κανείς (το hasPendingAccessRequest ελέγχει μόνο status: 'pending').
export async function resolveAccessRequest(requestId: string, status: 'accepted' | 'rejected') {
  return supabase
    .from('access_requests')
    .update({ status })
    .eq('id', requestId);
}
