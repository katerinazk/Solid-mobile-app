import { supabase } from './supabase';

export async function fetchDoctorByAmka(amka: string) {
  return supabase
    .from('doctors')
    .select('*')
    .eq('amka', amka)
    .single();
}
