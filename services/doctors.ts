import { supabase } from './supabase';

export async function fetchDoctorByAmka(amka: string) {
  return supabase
    .from('doctors')
    .select('*')
    .eq('amka', amka)
    .single();
}

export interface DoctorRegistrationForm {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string;
  phone: string;
  email: string;
}

export async function registerDoctor(form: DoctorRegistrationForm) {
  return supabase.from('doctors').insert([{
    first_name: form.first_name,
    last_name: form.last_name,
    amka: form.amka,
    specialty: form.specialty || null,
    phone: form.phone || null,
    email: form.email || null,
  }]);
}

export interface DoctorUpdateForm {
  first_name: string;
  last_name: string;
  specialty: string;
  phone: string;
  email: string;
}

// Το ΑΜΚΑ δεν αλλάζει ποτέ - είναι το κλειδί αναγνώρισης του γιατρού.
export async function updateDoctor(amka: string, form: DoctorUpdateForm) {
  return supabase.from('doctors').update({
    first_name: form.first_name,
    last_name: form.last_name,
    specialty: form.specialty || null,
    phone: form.phone || null,
    email: form.email || null,
  }).eq('amka', amka);
}
