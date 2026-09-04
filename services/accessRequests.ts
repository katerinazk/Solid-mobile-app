import { supabase } from './supabase';

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

export async function hasPendingAccessRequest(doctorAmka: string, patientAmka: string) {
  return supabase
    .from('access_requests')
    .select('id')
    .eq('doctor_amka', doctorAmka)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending')
    .maybeSingle();
}

export async function createAccessRequest(doctorAmka: string, patientAmka: string, accessType: string) {
  return supabase.from('access_requests').insert([{
    doctor_amka: doctorAmka,
    patient_amka: patientAmka,
    access_type: accessType,
    status: 'pending',
  }]);
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
    .eq('status', 'pending');
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

// Ο ασθενής αποδέχεται ή απορρίπτει ένα αίτημα - κρατάμε την εγγραφή (με νέο status) αντί να
// τη διαγράφουμε, ώστε να μη μπορεί ο γιατρός να ξαναστείλει το ίδιο αίτημα επ' άπειρον χωρίς
// να το προσέξει κανείς (το hasPendingAccessRequest ελέγχει μόνο status: 'pending').
export async function resolveAccessRequest(requestId: string, status: 'accepted' | 'rejected') {
  return supabase
    .from('access_requests')
    .update({ status })
    .eq('id', requestId);
}
