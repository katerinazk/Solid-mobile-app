import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';
import { dateToIso } from '../../../utils/dateInput';

export default function DoctorVaccinationFormScreen() {
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

  const { accessToken, loggedInDoctorAmka } = useAuth();
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
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε τον γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
        doctorName = doctorData ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})` : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
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

      const fileUrl = params.editUrl || `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      // Η λίστα ξαναδιαβάζει τον φάκελο μόλις επιστρέψει σε αυτήν η εστίαση.
      router.back();
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DoctorFormScreen
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
    </DoctorFormScreen>
  );
}
