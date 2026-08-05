import { supabase } from './supabase';
import { Patient } from '../types/Patient';

export async function fetchPatientsForDoctor(doctorAmka: string): Promise<Patient[]> {
  // Φέρνουμε μόνο τους ασθενείς που έχουν δώσει πρόσβαση σε αυτόν τον γιατρό,
  // μαζί με τον τύπο πρόσβασης που έχουν ορίσει.
  const { data, error } = await supabase
    .from('access')
    .select(`
      access_type,
      patients (first_name, last_name, amka, web_id)
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
      folderUrl: row.patients.web_id ? row.patients.web_id.replace('profile/card#me', 'public/') : ''
    }));
}

export interface PatientRegistrationForm {
  first_name: string;
  last_name: string;
  amka: string;
  birth_date: string;
  sex: string;
  blood_type: string;
  phone: string;
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
  }]);
}
