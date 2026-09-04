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
//
// Ψάχνει σε όνομα, επίθετο ή ΑΜΚΑ. Το κείμενο σπάει σε λέξεις, ώστε να δουλεύει και ολόκληρο
// το ονοματεπώνυμο ("Νίκος Παπαδόπουλος"): η βάση φέρνει όσους ταιριάζουν με την 1η λέξη και
// μετά κρατάμε μόνο όσους ταιριάζουν σε ΚΑΘΕ λέξη (η καθεμία σε όποιο πεδίο θέλει).
export async function searchPatients(searchQuery: string) {
  // Τα κόμματα και οι παρενθέσεις έχουν ειδική σημασία στο φίλτρο .or() του PostgREST.
  const terms = searchQuery.trim().split(/\s+/).map((t) => t.replace(/[,()]/g, '')).filter(Boolean);
  if (terms.length === 0) return { data: [], error: null };

  const first = terms[0];
  const { data, error } = await supabase
    .from('patients')
    .select('first_name, last_name, amka')
    .or(`first_name.ilike.%${first}%,last_name.ilike.%${first}%,amka.ilike.%${first}%`)
    .limit(50);

  if (error) return { data: null, error };

  const matchesAllTerms = (row: any) =>
    terms.every((term) => {
      const t = term.toLowerCase();
      return (row.first_name || '').toLowerCase().includes(t)
        || (row.last_name || '').toLowerCase().includes(t)
        || (row.amka || '').includes(t);
    });

  return { data: (data || []).filter(matchesAllTerms).slice(0, 20), error: null };
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
