import { fetchDoctorByAmka } from '../services/doctors';
import { fetchPatientByAmka } from '../services/patients';
import { isFemale } from '../constants/medicalOptions';

// Ποιος έγραψε την εγγραφή, όπως αποθηκεύεται μέσα στο αρχείο του Pod.
//
// Τα δύο πεδία λέγονται ιστορικά doctorName/doctorAmka επειδή αρχικά μόνο γιατροί
// καταχωρούσαν. Πλέον καταχωρεί και ο ασθενής για τον εαυτό του, οπότε το ίδιο ζευγάρι
// κρατά είτε "Δρ. Επίθετο Όνομα (Ειδικότητα)" είτε "κος/κα Επίθετο".
export interface RecordAuthor {
  doctorName: string;
  doctorAmka: string;
}

/**
 * Συμπληρώνει τον συντάκτη ανάλογα με το ποιος είναι συνδεδεμένος.
 *
 * Ο κανόνας ζει ΜΟΝΟ εδώ. Ήταν γραμμένος μέσα στη φόρμα κάθε κατηγορίας, οπότε κάθε νέα
 * κατηγορία τον αντέγραφε - και η μορφή του ονόματος κινδύνευε να αποκλίνει από οθόνη σε οθόνη.
 */
export async function resolveRecordAuthor(
  role: 'doctor' | 'patient' | null,
  loggedInDoctorAmka: string,
  loggedInPatientAmka: string,
): Promise<RecordAuthor> {
  if (role === 'patient') {
    const { data, error } = await fetchPatientByAmka(loggedInPatientAmka);
    // Χωρίς αυτό, μια αποτυχημένη αναζήτηση (π.χ. λόγω σύνδεσης) θα έγραφε σιωπηλά την
    // εγγραφή με άδειο όνομα αντί να ενημερώσει τον χρήστη και να τον αφήσει να ξαναδοκιμάσει.
    if (error) throw error;
    // "κος/κα" αντί για "Δρ.": ο ασθενής δεν είναι θεράπων ιατρός του εαυτού του.
    const salutation = isFemale(data?.sex) ? 'κα' : 'κος';
    return {
      doctorName: `${salutation} ${data?.last_name || ''}`.trim(),
      doctorAmka: loggedInPatientAmka,
    };
  }

  const { data, error } = await fetchDoctorByAmka(loggedInDoctorAmka);
  if (error) throw error;
  return {
    doctorName: data ? `Δρ. ${data.last_name} ${data.first_name} (${data.specialty})` : 'Δρ.',
    doctorAmka: loggedInDoctorAmka,
  };
}
