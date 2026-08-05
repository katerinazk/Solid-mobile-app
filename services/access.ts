import { supabase } from './supabase';

export async function fetchAccessListForPatient(patientAmka: string) {
  return supabase
    .from('access')
    .select(`
      doctor_amka,
      access_type,
      doctors (first_name, last_name, specialty, web_id)
    `)
    .eq('patient_amka', patientAmka);
}

export async function addAccess(patientAmka: string, doctorAmka: string, accessType: string) {
  return supabase
    .from('access')
    .insert([{
      patient_amka: patientAmka,
      doctor_amka: doctorAmka,
      access_type: accessType,
    }]);
}

export async function deleteAccess(patientAmka: string, doctorAmka: string) {
  return supabase
    .from('access')
    .delete()
    .eq('patient_amka', patientAmka)
    .eq('doctor_amka', doctorAmka);
}

export async function updateAccessType(patientAmka: string, doctorAmka: string, newType: string) {
  return supabase
    .from('access')
    .update({ access_type: newType })
    .eq('patient_amka', patientAmka)
    .eq('doctor_amka', doctorAmka);
}
