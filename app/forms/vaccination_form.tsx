import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../services/solidPod';
import { resolveRecordAuthor } from '../../utils/recordAuthor';
import { saveRecordEdit } from '../../services/recordRevisions';
import { MedicalCodePicker } from '../../components/MedicalCodePicker';
import { RecordFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../components/RecordFormScreen';
import { MedicalCode, codeFromRecord } from '../../services/medicalCodes';
import { dateToIso } from '../../utils/dateInput';
import { showMessage } from '../../utils/appMessage';

export default function VaccinationFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχοντος εμβολιασμού.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editBatchNumber?: string;
    editDoseNumber?: string;
    editAdministeredDate?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka, role, loggedInPatientAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Εμβολιασμοί') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [batchNumber, setBatchNumber] = useState(params.editBatchNumber || '');
  const [doseNumber, setDoseNumber] = useState(params.editDoseNumber || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !batchNumber.trim() || !doseNumber.trim()) {
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

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        doctorName,
        doctorAmka,
        batchNumber: batchNumber.trim(),
        doseNumber: doseNumber.trim(),
        // Ο εμβολιασμός γίνεται τη στιγμή της καταχώρησης, οπότε η ημερομηνία είναι η
        // σημερινή. Στην επεξεργασία κρατάμε την αρχική.
        administeredDate: params.editAdministeredDate || dateToIso(new Date()),
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
      title={isEditing ? 'Επεξεργασία' : 'Νέος Εμβολιασμός'}
      amka={params.amka}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Εμβολιασμοί"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <Text style={loginStyles.inputLabel}>Αριθμός Παρτίδας</Text>
      <TextInput style={[loginStyles.loginInput, formStyles.input]} value={batchNumber} onChangeText={setBatchNumber} />

      <Text style={loginStyles.inputLabel}>Αριθμός Δόσης</Text>
      <TextInput
        style={[loginStyles.loginInput, formStyles.input, { width: 70, paddingVertical: 10, marginBottom: 30 }]}
        keyboardType="numeric"
        maxLength={2}
        value={doseNumber}
        onChangeText={(text) => setDoseNumber(text.replace(/[^0-9]/g, '').slice(0, 2))}
      />
    </RecordFormScreen>
  );
}
