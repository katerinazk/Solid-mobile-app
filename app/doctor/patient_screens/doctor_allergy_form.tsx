import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';

export default function DoctorAllergyFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας αλλεργίας.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editReaction?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
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
      alert("Επιλέξτε αλλεργία από τον κατάλογο και συμπληρώστε την αντίδραση!");
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
        reaction: reaction.trim(),
        doctorName,
        doctorAmka,
      };

      const fileUrl = params.editUrl || newRecordFileName(folderUrl);
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
      title={isEditing ? 'Επεξεργασία' : 'Νέα Αλλεργία'}
      amka={params.amka}
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
    </DoctorFormScreen>
  );
}
