import { supabase } from './supabase';
import { Patient } from '../types/Patient';

export async function fetchPatientsForDoctor(doctorAmka: string): Promise<Patient[]> {
  // Φέρνουμε μόνο τους ασθενείς που έχουν δώσει πρόσβαση σε αυτόν τον γιατρό,
  // μαζί με τον τύπο πρόσβασης που έχουν ορίσει.
  const { data, error } = await supabase
    .from('access')
    .select(`
      access_type,
      patients (first_name, last_name, amka, web_id, birth_date)
    `)
    .eq('doctor_amka', doctorAmka);

  if (error) throw error;

  return (data || [])
    .filter((row: any) => row.patients)
    .map((row: any) => ({
      id: row.patients.amka,
      first_name: row.patients.first_name,
      last_name: row.patients.last_name,
      amka: row.patients.amka,
      accessType: row.access_type,
      webId: row.patients.web_id,
      folderUrl: row.patients.web_id ? row.patients.web_id.replace('profile/card#me', 'public/') : '',
      birthDate: row.patients.birth_date || '',
    }));
}

export async function fetchPatientByAmka(amka: string) {
  return supabase
    .from('patients')
    .select('*')
    .eq('amka', amka)
    .single();
}

// Αναζήτηση σε ΟΛΟΥΣ τους ασθενείς της βάσης (όχι μόνο σε όσους έχει ήδη πρόσβαση ο γιατρός),
// ώστε ο γιατρός να μπορεί να στείλει αίτημα πρόσβασης σε ασθενή που δεν έχει ακόμα.
// Επιστρέφουμε μόνο ονοματεπώνυμο + ΑΜΚΑ: όσα χρειάζεται η καρτέλα αποτελέσματος. Τα
// υπόλοιπα στοιχεία (WebID, ημ. γέννησης κ.λπ.) τα παίρνει ο γιατρός μόνο για ασθενείς που
// του έχουν ήδη δώσει πρόσβαση, μέσα από τη λίστα προσβάσεών του.
export async function searchPatientsByAmka(amkaQuery: string) {
  return supabase
    .from('patients')
    .select('first_name, last_name, amka')
    .ilike('amka', `%${amkaQuery}%`)
    .limit(20);
}

export interface PatientRegistrationForm {
  first_name: string;
  last_name: string;
  amka: string;
  birth_date: string;
  sex: string;
  blood_type: string;
  phone: string;
  email: string;
}

export async function registerPatient(form: PatientRegistrationForm) {
  return supabase.from('patients').insert([{
    first_name: form.first_name,
    last_name: form.last_name,
    amka: form.amka,
    birth_date: form.birth_date || null,
    sex: form.sex || null,
    blood_type: form.blood_type || null,
    phone: form.phone || null,
    email: form.email || null,
  }]);
}

export interface PatientUpdateForm {
  first_name: string;
  last_name: string;
  birth_date: string;
  sex: string;
  blood_type: string;
  phone: string;
  email: string;
}

// Το ΑΜΚΑ δεν αλλάζει ποτέ - είναι το κλειδί αναγνώρισης του ασθενή.
export async function updatePatient(amka: string, form: PatientUpdateForm) {
  return supabase.from('patients').update({
    first_name: form.first_name,
    last_name: form.last_name,
    birth_date: form.birth_date || null,
    sex: form.sex || null,
    blood_type: form.blood_type || null,
    phone: form.phone || null,
    email: form.email || null,
  }).eq('amka', amka);
}
