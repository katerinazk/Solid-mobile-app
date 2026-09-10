import { supabase } from './supabase';

// Μία εγγραφή του καταλόγου νοσοκομείων και ιδιωτικών κλινικών της Ελλάδας.
export interface Hospital {
  id: number;
  name: string;
  // Πόλη ή δήμος ("Αθήνα", "Μαρούσι").
  area: string;
  // Περιφέρεια όπως τη χωρίζει ο κατάλογος ("Αττική", "Κρήτη").
  region: string;
  type: 'public' | 'private';
  founded: number | null;
}

// Οι εγγραφές στο Pod κρατούν μόνο ονομασία και περιοχή, όχι ολόκληρη τη γραμμή του
// καταλόγου. Όταν ανοίγει η φόρμα επεξεργασίας, ανασυνθέτουμε από αυτά μια εγγραφή ώστε να
// φαίνεται η τρέχουσα επιλογή, χωρίς νέο ερώτημα στη βάση. Οι παλιές εγγραφές ελεύθερου
// κειμένου δεν έχουν περιοχή - εμφανίζονται κανονικά, απλώς χωρίς αυτήν.
export function hospitalFromRecord(record: { hospitalClinic?: string; hospitalArea?: string }): Hospital | null {
  if (!record.hospitalClinic) return null;

  return {
    id: -1,
    name: record.hospitalClinic,
    area: record.hospitalArea || '',
    region: '',
    type: 'public',
    founded: null,
  };
}

// Η αναζήτηση γίνεται από συνάρτηση της βάσης (search_hospitals) και όχι με ilike από εδώ:
// εκεί αγνοούνται οι τόνοι ("ευαγγελισμος" -> "Ευαγγελισμός") και η ταξινόμηση φέρνει πρώτα
// όσα αρχίζουν με αυτό που γράφτηκε.
export async function searchHospitals(
  query: string,
  limit = 20
): Promise<{ data: Hospital[]; error: any }> {
  const { data, error } = await supabase.rpc('search_hospitals', {
    p_query: query.trim(),
    p_limit: limit,
  });

  return { data: (data || []) as Hospital[], error };
}
