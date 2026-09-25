import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../services/solidPod';
import { todayIsoDate } from '../../utils/podRecords';
import { resolveRecordAuthor } from '../../utils/recordAuthor';
import { saveRecordEdit } from '../../services/recordRevisions';
import { notifyRecordChange } from '../../services/notifications';
import { MedicalCodePicker } from '../../components/MedicalCodePicker';
import { RecordFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../components/RecordFormScreen';
import { MedicalCode, codeFromRecord } from '../../services/medicalCodes';
import { showMessage } from '../../utils/appMessage';
import { friendlyErrorMessage } from '../../utils/networkError';

export default function AllergyFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    firstName: string;
    lastName: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας αλλεργίας.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editReaction?: string;
    editCreatedDate?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka, role, loggedInPatientAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Αλλεργίες') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [reaction, setReaction] = useState(params.editReaction || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !reaction.trim()) {
      showMessage("Επιλέξτε αλλεργία από τον κατάλογο και συμπληρώστε την αντίδραση!");
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

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        reaction: reaction.trim(),
        // Η ημερομηνία καταχώρησης γράφεται μέσα στην εγγραφή, ώστε να τη βλέπει και όποιο
        // άλλο εργαλείο διαβάσει το Pod του ασθενή. Στην επεξεργασία κρατάμε την αρχική.
        createdDate: params.editCreatedDate || todayIsoDate(),
        doctorName,
        doctorAmka,
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

      // Ο ασθενής ενημερώνεται όταν γιατρός προσθέτει ή τροποποιεί εγγραφή στον φάκελό του.
      if (role === 'doctor') {
        await notifyRecordChange(params.amka, loggedInDoctorAmka, 'Αλλεργίες', isEditing ? 'edited' : 'added', record.title, fileUrl);
      }

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
      title={isEditing ? 'Επεξεργασία' : 'Νέα Αλλεργία'}
      patientName={params.amka ? `${params.firstName} ${params.lastName}` : undefined}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Αλλεργίες"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <Text style={loginStyles.inputLabel}>Αντίδραση</Text>
      <TextInput
        style={[styles.textArea, formStyles.input, { height: 130 }]}
        multiline
        value={reaction}
        onChangeText={setReaction}
      />
    </RecordFormScreen>
  );
}
