import { supabase } from './supabase';
import { normalizeForSearch } from '../utils/recordSearch';
import { toAccentInsensitivePattern } from '../utils/greekSearchPattern';

export async function fetchDoctorByAmka(amka: string) {
  return supabase
    .from('doctors')
    .select('*')
    .eq('amka', amka)
    .single();
}

// Αναζήτηση σε ΟΛΟΥΣ τους γιατρούς της βάσης, όχι μόνο σε όσους έχει ήδη δώσει πρόσβαση ο
// ασθενής: αλλιώς δεν θα μπορούσε ποτέ να βρει καινούργιο γιατρό χωρίς να ξέρει απέξω το ΑΜΚΑ του.
//
// Επιστρέφουμε ονοματεπώνυμο, ΑΜΚΑ και ειδικότητα - όσα χρειάζεται η καρτέλα αποτελέσματος για
// να ξεχωρίσει ο ασθενής δύο συνονόματους γιατρούς. Το WebID δεν μπαίνει εδώ: το ζητάμε με
// fetchDoctorByAmka τη στιγμή που δίνεται πράγματι η πρόσβαση και χρειάζεται για το ACL.
//
// Ψάχνει σε όνομα, επίθετο ή ΑΜΚΑ. Το κείμενο σπάει σε λέξεις, ώστε να δουλεύει και ολόκληρο
// το ονοματεπώνυμο ("Νίκος Παπαδόπουλος"): η βάση φέρνει όσους ταιριάζουν με την 1η λέξη και
// μετά κρατάμε μόνο όσους ταιριάζουν σε ΚΑΘΕ λέξη (η καθεμία σε όποιο πεδίο θέλει).
export async function searchDoctors(searchQuery: string) {
  // Τα κόμματα και οι παρενθέσεις έχουν ειδική σημασία στο φίλτρο .or() του PostgREST.
  const terms = searchQuery.trim().split(/\s+/).map((t) => t.replace(/[,()]/g, '')).filter(Boolean);
  if (terms.length === 0) return { data: [], error: null };

  // imatch αντί για ilike στο όνομα/επίθετο: επιτρέπει regex, οπότε κάθε φωνήεν ψάχνεται σε
  // ΟΛΕΣ τις τονισμένες/άτονες μορφές του - το ΑΜΚΑ μένει σε ilike, είναι μόνο αριθμοί.
  const first = terms[0];
  const firstPattern = toAccentInsensitivePattern(first);
  const { data, error } = await supabase
    .from('doctors')
    .select('first_name, last_name, amka, specialty')
    .or(`first_name.imatch.${firstPattern},last_name.imatch.${firstPattern},amka.ilike.%${first}%`)
    .limit(50);

  if (error) return { data: null, error };

  const matchesAllTerms = (row: any) =>
    terms.every((term) => {
      const t = normalizeForSearch(term);
      return normalizeForSearch(row.first_name || '').includes(t)
        || normalizeForSearch(row.last_name || '').includes(t)
        || (row.amka || '').includes(term);
    });

  return { data: (data || []).filter(matchesAllTerms).slice(0, 20), error: null };
}

export interface DoctorRegistrationForm {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string;
  sex: string;
  phone: string;
  email: string;
}

export async function registerDoctor(form: DoctorRegistrationForm) {
  return supabase.from('doctors').insert([{
    first_name: form.first_name,
    last_name: form.last_name,
    amka: form.amka,
    specialty: form.specialty || null,
    sex: form.sex || null,
    phone: form.phone || null,
    email: form.email || null,
  }]);
}

export interface DoctorUpdateForm {
  first_name: string;
  last_name: string;
  specialty: string;
  sex: string;
  phone: string;
  email: string;
}

// Το ΑΜΚΑ δεν αλλάζει ποτέ - είναι το κλειδί αναγνώρισης του γιατρού.
export async function updateDoctor(amka: string, form: DoctorUpdateForm) {
  return supabase.from('doctors').update({
    first_name: form.first_name,
    last_name: form.last_name,
    specialty: form.specialty || null,
    sex: form.sex || null,
    phone: form.phone || null,
    email: form.email || null,
  }).eq('amka', amka);
}

// Όπως και στον ασθενή: σβήνοντας το web_id, η επόμενη είσοδος δένει το ΑΜΚΑ με νέο Pod.
export async function clearDoctorWebId(amka: string) {
  return supabase
    .from('doctors')
    .update({ web_id: null })
    .eq('amka', amka);
}
