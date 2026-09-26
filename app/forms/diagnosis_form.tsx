import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../services/solidPod';
import { fetchDoctorByAmka } from '../../services/doctors';
import { MedicalCodePicker } from '../../components/MedicalCodePicker';
import { RecordFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../components/RecordFormScreen';
import { MedicalCode, codeFromRecord } from '../../services/medicalCodes';
import { resolveRecordAuthor } from '../../utils/recordAuthor';
import { saveRecordEdit } from '../../services/recordRevisions';
import { notifyRecordChange } from '../../services/notifications';
import { RecordLinkPicker } from '../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords, filterExistingLinks } from '../../services/historyRecords';
import { showMessage } from '../../utils/appMessage';
import { friendlyErrorMessage } from '../../utils/networkError';

export default function DiagnosisFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    firstName: string;
    lastName: string;
    webId: string;
    accessType: string;
    // 'adult' | 'child' - η κατηγορία στην οποία ανήκει ο ασθενής με βάση την ηλικία του.
    category: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας διάγνωσης.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editDate?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
    // Οι σύνδεσμοι προς άλλες εγγραφές ιστορικού, ως JSON πίνακας.
    editLinks?: string;
  }>();

  const { accessToken, loggedInDoctorAmka, role, loggedInPatientAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Διαγνώσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [links, setLinks] = useState<LinkedRecord[]>(parseLinkedRecords(params.editLinks));
  const [saving, setSaving] = useState(false);

  // Αν ο ασθενής έσβησε στο μεταξύ κάποια από τις συνδεδεμένες εγγραφές, φεύγει και η
  // σύνδεση: δεν θέλουμε ο γιατρός να βλέπει, και να ξαναποθηκεύει, σύνδεσμο προς το κενό.
  useEffect(() => {
    if (links.length === 0) return;

    let canceled = false;
    (async () => {
      const alive = await filterExistingLinks(params.webId, links, accessToken);
      if (!canceled && alive.length !== links.length) setLinks(alive);
    })();

    return () => { canceled = true; };
    // Μία φορά, με τους συνδέσμους που ήρθαν από την καρτέλα.
  }, []);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode) {
      showMessage("Παρακαλώ επιλέξτε διάγνωση από τον κατάλογο ICD-10!");
      return;
    }

    if (!accessToken) {
      showMessage("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε ημερομηνία και γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(loggedInDoctorAmka);
        // Χωρίς αυτό, μια αποτυχημένη αναζήτηση (π.χ. λόγω σύνδεσης) θα αποθήκευε σιωπηλά τη
        // διάγνωση με γενικό "Δρ." αντί να ενημερώσει τον χρήστη και να τον αφήσει να
        // ξαναδοκιμάσει.
        if (doctorError) throw doctorError;
        doctorName = doctorData ? `Δρ. ${doctorData.last_name}` : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        date: params.editDate || new Date().toISOString(),
        doctorName,
        doctorAmka,
        category: params.category,
        links: links.length > 0 ? links : undefined,
      };

      const fileUrl = params.editUrl || newRecordFileName(`${folderUrl}${params.category}_`);
      // Η διόρθωση δεν γράφει απλώς από πάνω: κρατά την προηγούμενη μορφή μέσα στο ίδιο
      // αρχείο, μαζί με το ποιος τη διόρθωσε και πότε. Έτσι η επεξεργασία παύει να είναι
      // εξίσου καταστροφική με τη διαγραφή.
      if (params.editUrl) {
        const editor = await resolveRecordAuthor(role, loggedInDoctorAmka, loggedInPatientAmka);
        await saveRecordEdit(fileUrl, accessToken, record, editor);
      } else {
        await saveFileContent(fileUrl, accessToken, JSON.stringify(record));
      }

      // Ο ασθενής ενημερώνεται όταν γιατρός προσθέτει ή τροποποιεί εγγραφή στον φάκελό του.
      // Μήνυμα επιτυχίας σε κάθε αποθήκευση, εκτός αν ο γιατρός έχει ήδη ενημερωθεί ότι η εγγραφή
      // πήγε στο παλιό Pod του ασθενή.
      const writtenToCurrentPod = role === 'doctor' ? await notifyRecordChange(params.amka, loggedInDoctorAmka, 'Διαγνώσεις', isEditing ? 'edited' : 'added', fileUrl) : true;
      if (writtenToCurrentPod) showMessage('Η εγγραφή αποθηκεύτηκε επιτυχώς.');

      // Η λίστα ξαναδιαβάζει τον φάκελο μόλις επιστρέψει σε αυτήν η εστίαση.
      router.back();
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, "Αποτυχία σύνδεσης με το Pod."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecordFormScreen
      title={isEditing ? 'Επεξεργασία' : 'Νέα Διάγνωση'}
      patientName={params.amka ? `${params.firstName} ${params.lastName}` : undefined}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Διαγνώσεις"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <RecordLinkPicker
        webId={params.webId}
        accessToken={accessToken}
        excludeCategory="Διαγνώσεις"
        value={links}
        onChange={setLinks}
      />
    </RecordFormScreen>
  );
}
