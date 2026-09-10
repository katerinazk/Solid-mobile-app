import React, { useState } from 'react';
import { Text, View, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../../constants/colors';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, uploadAttachment } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';
import { createDateHandler, splitIsoDate } from '../../../utils/dateInput';

interface PendingFile {
  name: string;
  uri: string;
  mimeType: string;
}

// Τα ήδη ανεβασμένα συνημμένα ταξιδεύουν ως JSON στα params. Δεν τα ξαναανεβάζουμε - απλώς
// τα κουβαλάμε, ώστε η αποθήκευση να μην τα σβήσει από την εγγραφή.
function parseAttachments(raw?: string): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function DoctorHospitalizationFormScreen() {
  const params = useLocalSearchParams<{
    amka: string;
    webId: string;
    accessType: string;
    // Συμπληρωμένα μόνο στην επεξεργασία υπάρχουσας νοσηλίας.
    editUrl?: string;
    editCode?: string;
    editTitle?: string;
    editParentName?: string;
    editHospitalClinic?: string;
    editAdmissionDate?: string;
    editDischargeDate?: string;
    editAttachments?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Νοσηλίες') : '';

  const isEditing = !!params.editUrl;
  const existingAttachments = parseAttachments(params.editAttachments);

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [hospitalClinic, setHospitalClinic] = useState(params.editHospitalClinic || '');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);

  const admission = splitIsoDate(params.editAdmissionDate);
  const [admDay, setAdmDay] = useState(admission.day);
  const [admMonth, setAdmMonth] = useState(admission.month);
  const [admYear, setAdmYear] = useState(admission.year);
  const admissionDate = admDay + (admMonth ? `/${admMonth}` : '') + (admYear ? `/${admYear}` : '');
  const handleAdmissionDateChange = createDateHandler(admDay, setAdmDay, admMonth, setAdmMonth, admYear, setAdmYear, admissionDate);

  const discharge = splitIsoDate(params.editDischargeDate);
  const [disDay, setDisDay] = useState(discharge.day);
  const [disMonth, setDisMonth] = useState(discharge.month);
  const [disYear, setDisYear] = useState(discharge.year);
  const dischargeDate = disDay + (disMonth ? `/${disMonth}` : '') + (disYear ? `/${disYear}` : '');
  const handleDischargeDateChange = createDateHandler(disDay, setDisDay, disMonth, setDisMonth, disYear, setDisYear, dischargeDate);

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets) return;
      setPendingFiles((prev) => [
        ...prev,
        ...result.assets.map((asset) => ({
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
        })),
      ]);
    } catch (error: any) {
      alert(error.message || 'Αποτυχία επιλογής αρχείου.');
    }
  };

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !hospitalClinic.trim() || !admissionDate.trim() || !dischargeDate.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (admDay.length !== 2 || admMonth.length !== 2 || admYear.length !== 4) {
      alert("Παρακαλώ συμπληρώστε πλήρη ημερομηνία εισαγωγής (ΗΗ/ΜΜ/ΕΕΕΕ).");
      return;
    }
    if (disDay.length !== 2 || disMonth.length !== 2 || disYear.length !== 4) {
      alert("Παρακαλώ συμπληρώστε πλήρη ημερομηνία εξιτηρίου (ΗΗ/ΜΜ/ΕΕΕΕ).");
      return;
    }

    const currentYear = new Date().getFullYear();
    if (Number(admYear) < currentYear - 10 || Number(admYear) > currentYear) {
      alert(`Το έτος εισαγωγής πρέπει να είναι μεταξύ ${currentYear - 10} και ${currentYear}.`);
      return;
    }
    if (Number(disYear) < currentYear - 10 || Number(disYear) > currentYear) {
      alert(`Το έτος εξιτηρίου πρέπει να είναι μεταξύ ${currentYear - 10} και ${currentYear}.`);
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
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      const fileUrl = params.editUrl || `${folderUrl}${Date.now()}.json`;

      // Τα συνημμένα ανεβαίνουν δίπλα στην εγγραφή, οπότε χρειάζονται το τελικό της URL.
      for (const file of pendingFiles) {
        await uploadAttachment(fileUrl, file.name, file.uri, file.mimeType, accessToken);
      }

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        hospitalClinic: hospitalClinic.trim(),
        doctorName,
        doctorAmka,
        admissionDate: `${admYear}-${admMonth}-${admDay}`,
        dischargeDate: `${disYear}-${disMonth}-${disDay}`,
        attachments: [...existingAttachments, ...pendingFiles.map((file) => file.name)],
      };

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
      title={isEditing ? 'Επεξεργασία' : 'Νέα Νοσηλία'}
      amka={params.amka}
      saving={saving}
      onSave={handleSave}
    >
      <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
      <MedicalCodePicker
        category="Νοσηλίες"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <Text style={loginStyles.inputLabel}>Νοσοκομείο / Κλινική</Text>
      <TextInput style={[loginStyles.loginInput, formStyles.input]} value={hospitalClinic} onChangeText={setHospitalClinic} />

      <Text style={loginStyles.inputLabel}>Ημερομηνία Εισαγωγής</Text>
      <TextInput
        style={[loginStyles.loginInput, formStyles.input]}
        placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
        keyboardType="numeric"
        maxLength={10}
        value={admissionDate}
        onChangeText={handleAdmissionDateChange}
      />

      <Text style={loginStyles.inputLabel}>Ημερομηνία Εξιτηρίου</Text>
      <TextInput
        style={[loginStyles.loginInput, formStyles.input]}
        placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
        keyboardType="numeric"
        maxLength={10}
        value={dischargeDate}
        onChangeText={handleDischargeDateChange}
      />

      <TouchableOpacity
        style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0 }]}
        onPress={handlePickFiles}
      >
        <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
        <Text style={doctorStyles.diagnosisSortButtonText}>Επισύναψη αρχείων</Text>
      </TouchableOpacity>

      {pendingFiles.length > 0 && (
        <View style={{ marginTop: 10 }}>
          {pendingFiles.map((file) => (
            <View key={file.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <Ionicons name="document-outline" size={18} color={COLORS.text} style={{ marginRight: 8 }} />
              <Text style={{ flex: 1 }} numberOfLines={1}>{file.name}</Text>
              <TouchableOpacity
                onPress={() => setPendingFiles((prev) => prev.filter((f) => f.name !== file.name))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle-outline" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </DoctorFormScreen>
  );
}
