import { supabase } from './supabase';

// Μία εγγραφή του καταλόγου προτύπων (ICD-10 / ATC / LOINC).
export interface MedicalCode {
  id: number;
  system: 'ICD10' | 'ATC' | 'LOINC';
  code: string;
  name: string;
  category: string;
  parent_code: string | null;
  // Η ονομασία του γονέα, ως συμφραζόμενο - τα υποεπίπεδα του ICD δεν στέκουν μόνα τους.
  parent_name: string | null;
  routes: string | null;
  extra: any | null;
}

// Οι κατηγορίες του καταλόγου αντιστοιχούν 1-1 στις οθόνες ιστορικού.
export type MedicalCodeCategory =
  | 'Διαγνώσεις'
  | 'Αλλεργίες'
  | 'Νοσηλίες'
  | 'Φάρμακα'
  | 'Εμβολιασμοί'
  | 'Εξετάσεις';

// Οι εγγραφές στο Pod κρατούν μόνο code/title/parentName, όχι ολόκληρη τη γραμμή του
// καταλόγου. Όταν ανοίγει η φόρμα επεξεργασίας, ανασυνθέτουμε από αυτά μια εγγραφή ώστε να
// φαίνεται η τρέχουσα επιλογή, χωρίς νέο ερώτημα στη βάση. Οι παλιές εγγραφές ελεύθερου
// κειμένου δεν έχουν κωδικό - εκεί επιστρέφουμε null και η φόρμα ξεκινά κενή.
export function codeFromRecord(record: {
  code?: string;
  title?: string;
  parentName?: string;
  routes?: string;
}): MedicalCode | null {
  if (!record.code) return null;

  return {
    id: -1,
    system: 'ICD10',
    code: record.code,
    name: record.title || '',
    category: '',
    parent_code: null,
    parent_name: record.parentName || null,
    routes: record.routes || null,
    extra: null,
  };
}

// Η αναζήτηση γίνεται από συνάρτηση της βάσης (search_medical_codes) και όχι με ilike από εδώ:
// εκεί αγνοούνται οι τόνοι ("διαβητης" -> "Σακχαρώδης διαβήτης") και η ταξινόμηση φέρνει πρώτα
// τα ταιριάσματα κωδικού και τα συντομότερα ονόματα.
export async function searchMedicalCodes(
  category: MedicalCodeCategory,
  query: string,
  limit = 20
): Promise<{ data: MedicalCode[]; error: any }> {
  const { data, error } = await supabase.rpc('search_medical_codes', {
    p_category: category,
    p_query: query.trim(),
    p_limit: limit,
  });

  return { data: (data || []) as MedicalCode[], error };
}
