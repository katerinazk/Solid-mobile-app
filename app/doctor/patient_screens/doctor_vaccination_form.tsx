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
import { createDateHandler, splitIsoDate } from '../../../utils/dateInput';

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
    editCommercialName?: string;
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
  const initialDate = splitIsoDate(params.editAdministeredDate);

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [commercialName, setCommercialName] = useState(params.editCommercialName || '');
  const [batchNumber, setBatchNumber] = useState(params.editBatchNumber || '');
  const [doseNumber, setDoseNumber] = useState(params.editDoseNumber || '');
  const [saving, setSaving] = useState(false);

  const [day, setDay] = useState(initialDate.day);
  const [month, setMonth] = useState(initialDate.month);
  const [year, setYear] = useState(initialDate.year);
  const administeredDate = day + (month ? `/${month}` : '') + (year ? `/${year}` : '');
  const handleDateChange = createDateHandler(day, setDay, month, setMonth, year, setYear, administeredDate);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !commercialName.trim() || !batchNumber.trim() || !doseNumber.trim() || !administeredDate.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
      alert("Παρακαλώ συμπληρώστε πλήρη ημερομηνία (ΗΗ/ΜΜ/ΕΕΕΕ).");
      return;
    }

    const currentYear = new Date().getFullYear();
    if (Number(year) < currentYear - 10 || Number(year) > currentYear) {
      alert(`Το έτος πρέπει να είναι μεταξύ ${currentYear - 10} και ${currentYear}.`);
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
        commercialName: commercialName.trim(),
        doctorName,
        doctorAmka,
        batchNumber: batchNumber.trim(),
        doseNumber: doseNumber.trim(),
        administeredDate: `${year}-${month}-${day}`,
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

      <Text style={loginStyles.inputLabel}>Εμπορική Ονομασία</Text>
      <TextInput style={[loginStyles.loginInput, formStyles.input]} value={commercialName} onChangeText={setCommercialName} />

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

      <Text style={loginStyles.inputLabel}>Ημερομηνία Χορήγησης</Text>
      <TextInput
        style={[loginStyles.loginInput, formStyles.input]}
        placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
        keyboardType="numeric"
        maxLength={10}
        value={administeredDate}
        onChangeText={handleDateChange}
      />
    </DoctorFormScreen>
  );
}
