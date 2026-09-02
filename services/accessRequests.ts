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
      doctors (first_name, last_name, specialty)
    `)
    .eq('patient_amka', patientAmka)
    .eq('status', 'pending');
}
