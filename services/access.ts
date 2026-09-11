import { supabase } from './supabase';

export async function fetchAccessListForPatient(patientAmka: string) {
  return supabase
    .from('access')
    .select(`
      doctor_amka,
      access_type,
      acl_synced,
      doctors (first_name, last_name, specialty, web_id)
    `)
    .eq('patient_amka', patientAmka);
}

// Έλεγχος αν ο συγκεκριμένος γιατρός έχει ήδη πρόσβαση σε αυτόν τον ασθενή. Ρωτάμε τη βάση
// τη στιγμή του ελέγχου: η λίστα προσβάσεων που κρατάει η οθόνη στη μνήμη φορτώνεται μία
// φορά και μπορεί να είναι παλιά - ή και άδεια, αν είχε αποτύχει η φόρτωσή της.
export async function fetchAccessEntry(patientAmka: string, doctorAmka: string) {
  return supabase
    .from('access')
    .select('doctor_amka, access_type, acl_synced')
    .eq('patient_amka', patientAmka)
    .eq('doctor_amka', doctorAmka)
    .maybeSingle();
}

// aclSynced = μπήκε ο γιατρός στο ACL του Pod; Είναι false όταν δεν έχει ακόμα WebID (δεν έχει
// κάνει ποτέ Solid login) - ο φάκελος του ασθενή δεν του εμφανίζεται μέχρι να συγχρονιστεί.
export async function addAccess(patientAmka: string, doctorAmka: string, accessType: string, aclSynced: boolean) {
  return supabase
    .from('access')
    .insert([{
      patient_amka: patientAmka,
      doctor_amka: doctorAmka,
      access_type: accessType,
      acl_synced: aclSynced,
    }]);
}

// Καλείται μόλις ο ασθενής ξαναγράψει το ACL του Pod του, για τους γιατρούς που μπήκαν τελικά.
export async function markAccessAclSynced(patientAmka: string, doctorAmkas: string[]) {
  if (doctorAmkas.length === 0) return { error: null };
  return supabase
    .from('access')
    .update({ acl_synced: true })
    .eq('patient_amka', patientAmka)
    .in('doctor_amka', doctorAmkas);
}

export async function deleteAccess(patientAmka: string, doctorAmka: string) {
  return supabase
    .from('access')
    .delete()
    .eq('patient_amka', patientAmka)
    .eq('doctor_amka', doctorAmka);
}

// Το acl_synced είναι η πύλη της πλευράς του γιατρού: όσο είναι false, ο ασθενής δεν του
// εμφανίζεται καθόλου και ο φύλακας τον βγάζει από τον φάκελο. Το "Καμία Πρόσβαση" το
// κατεβάζει χωρίς να σβήσει την εγγραφή, και η επαναφορά πρόσβασης το ξανασηκώνει.
export async function updateAccessType(patientAmka: string, doctorAmka: string, newType: string, aclSynced?: boolean) {
  const changes: { access_type: string; acl_synced?: boolean } = { access_type: newType };
  if (aclSynced !== undefined) changes.acl_synced = aclSynced;

  return supabase
    .from('access')
    .update(changes)
    .eq('patient_amka', patientAmka)
    .eq('doctor_amka', doctorAmka);
}
