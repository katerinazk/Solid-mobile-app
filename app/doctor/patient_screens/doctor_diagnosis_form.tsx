import React, { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, newRecordFileName } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';

export default function DoctorDiagnosisFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
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
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Διαγνώσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode) {
      alert("Παρακαλώ επιλέξτε διάγνωση από τον κατάλογο ICD-10!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      // Στην επεξεργασία κρατάμε ημερομηνία και γιατρό της αρχικής καταχώρησης.
      let doctorName = params.editDoctorName || '';
      let doctorAmka = params.editDoctorAmka || '';
      if (!isEditing) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
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
      };

      const fileUrl = params.editUrl || newRecordFileName(`${folderUrl}${params.category}_`);
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
      title={isEditing ? 'Επεξεργασία' : 'Νέα Διάγνωση'}
      amka={params.amka}
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
    </DoctorFormScreen>
  );
}
