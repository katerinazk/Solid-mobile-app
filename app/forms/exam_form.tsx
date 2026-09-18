import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../services/solidPod';
import { todayIsoDate } from '../../utils/podRecords';
import { resolveRecordAuthor } from '../../utils/recordAuthor';
import { saveRecordEdit } from '../../services/recordRevisions';
import { MedicalCodePicker } from '../../components/MedicalCodePicker';
import { RecordFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../components/RecordFormScreen';
import { MedicalCode, codeFromRecord } from '../../services/medicalCodes';
import { SelectField } from '../../components/SelectField';
import { EXAM_TYPES, EXAM_STATUS_OPTIONS, EXAM_STATUS_PENDING, EXAM_STATUS_COMPLETED } from '../../constants/medicalOptions';
import { RecordLinkPicker } from '../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords, filterExistingLinks } from '../../services/historyRecords';
import { showMessage } from '../../utils/appMessage';

export default function ExamFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας εξέτασης.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editType?: string;
    editStatus?: string;
    editCompletedDate?: string;
    editResultFile?: string;
    editCreatedDate?: string;
    // Οι σύνδεσμοι προς άλλες εγγραφές ιστορικού, ως JSON πίνακας.
    editLinks?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka, role, loggedInPatientAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Εξετάσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [type, setType] = useState(params.editType || '');
  // Μόνο ο ασθενής επιλέγει κατάσταση. Ο γιατρός παραγγέλνει εξέταση, δεν την εκτελεί.
  const [statusLabel, setStatusLabel] = useState(
    params.editStatus === 'completed' ? EXAM_STATUS_COMPLETED : EXAM_STATUS_PENDING
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

    if (!selectedCode || !type.trim()) {
      showMessage("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      showMessage("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε τον γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const author = await resolveRecordAuthor(role, loggedInDoctorAmka, loggedInPatientAmka);
        doctorName = author.doctorName;
        doctorAmka = author.doctorAmka;
      }

      // Όταν καταχωρεί ο γιατρός, η εξέταση μπαίνει πάντα ως εκκρεμής και την ολοκληρώνει ο
      // ασθενής ανεβάζοντας το αποτέλεσμα. Ο ασθενής όμως μπορεί να γράφει και εξέταση που
      // έχει ήδη κάνει, οπότε διαλέγει ο ίδιος.
      const status: 'pending' | 'completed' = role === 'patient'
        ? (statusLabel === EXAM_STATUS_COMPLETED ? 'completed' : 'pending')
        : ((params.editStatus as 'pending' | 'completed') || 'pending');

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        type,
        status,
        doctorName,
        doctorAmka,
        // Η ημερομηνία και το αρχείο αποτελέσματος κρατιούνται μόνο όσο η εξέταση είναι
        // ολοκληρωμένη - αλλιώς θα έμενε ημερομηνία αποτελέσματος σε εκκρεμή εξέταση.
        completedDate: status === 'completed' ? (params.editCompletedDate || todayIsoDate()) : undefined,
        resultFile: status === 'completed' ? params.editResultFile : undefined,
        // Στην επεξεργασία κρατάμε την αρχική ημερομηνία καταχώρησης, δεν τη μηδενίζουμε.
        createdDate: params.editCreatedDate || todayIsoDate(),
        links: links.length > 0 ? links : undefined,
      };

      const fileUrl = params.editUrl || newRecordFileName(folderUrl);
      // Η διόρθωση δεν γράφει απλώς από πάνω: κρατά την προηγούμενη μορφή μέσα στο ίδιο
      // αρχείο, μαζί με το ποιος τη διόρθωσε και πότε. Έτσι η επεξεργασία παύει να είναι
      // εξίσου καταστροφική με τη διαγραφή.
      if (params.editUrl) {
        const editor = await resolveRecordAuthor(role, loggedInDoctorAmka, loggedInPatientAmka);
        await saveRecordEdit(fileUrl, accessToken, record, editor);
      } else {
        await saveFileContent(fileUrl, accessToken, JSON.stringify(record));
      }

      // Η λίστα ξαναδιαβάζει τον φάκελο μόλις επιστρέψει σε αυτήν η εστίαση.
      router.back();
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecordFormScreen
      title={isEditing ? 'Επεξεργασία' : 'Νέα Εξέταση'}
      amka={params.amka}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Εξετάσεις"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <SelectField
        label="Τύπος"
        value={type}
        onChange={setType}
        options={EXAM_TYPES}
        placeholder="Επιλέξτε τύπο"
      />

      {role === 'patient' && (
        <SelectField
          label="Κατάσταση"
          value={statusLabel}
          onChange={setStatusLabel}
          options={EXAM_STATUS_OPTIONS}
        />
      )}

      <RecordLinkPicker
        webId={params.webId}
        accessToken={accessToken}
        excludeCategory="Εξετάσεις"
        value={links}
        onChange={setLinks}
      />
    </RecordFormScreen>
  );
}
