import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../../constants/colors';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl, uploadAttachment, newRecordFileName } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';
import { HospitalPicker } from '../../../components/HospitalPicker';
import { Hospital, hospitalFromRecord } from '../../../services/hospitals';
import { DateField } from '../../../components/DateField';
import { validatePastDate, isoToDate } from '../../../utils/dateInput';
import { RecordLinkPicker } from '../../../components/RecordLinkPicker';
import { LinkedRecord, parseLinkedRecords, filterExistingLinks } from '../../../services/historyRecords';

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
    editHospitalArea?: string;
    editAdmissionDate?: string;
    editDischargeDate?: string;
    editAttachments?: string;
    editDoctorName?: string;
    editDoctorAmka?: string;
    editLinks?: string;
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Νοσηλίες') : '';

  const isEditing = !!params.editUrl;
  const existingAttachments = parseAttachments(params.editAttachments);

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [hospital, setHospital] = useState<Hospital | null>(
    hospitalFromRecord({ hospitalClinic: params.editHospitalClinic, hospitalArea: params.editHospitalArea })
  );
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<LinkedRecord[]>(parseLinkedRecords(params.editLinks));

  const [admissionDate, setAdmissionDate] = useState(params.editAdmissionDate || '');
  const [dischargeDate, setDischargeDate] = useState(params.editDischargeDate || '');

  // Το ημερολόγιο δεν αφήνει να επιλεγεί μελλοντική ημερομηνία.
  const today = new Date();

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

    if (!selectedCode || !hospital) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    const admissionError = validatePastDate(admissionDate, 'Ημερομηνία εισαγωγής');
    if (admissionError) {
      alert(admissionError);
      return;
    }

    const dischargeError = validatePastDate(dischargeDate, 'Ημερομηνία εξιτηρίου');
    if (dischargeError) {
      alert(dischargeError);
      return;
    }

    // Το εξιτήριο δεν γίνεται να προηγείται της εισαγωγής.
    if (dischargeDate < admissionDate) {
      alert("Η ημερομηνία εξιτηρίου δεν μπορεί να είναι πριν από την ημερομηνία εισαγωγής.");
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

      const fileUrl = params.editUrl || newRecordFileName(folderUrl);

      // Τα συνημμένα ανεβαίνουν δίπλα στην εγγραφή, οπότε χρειάζονται το τελικό της URL.
      for (const file of pendingFiles) {
        await uploadAttachment(fileUrl, file.name, file.uri, file.mimeType, accessToken);
      }

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        hospitalClinic: hospital.name,
        hospitalArea: hospital.area || undefined,
        doctorName,
        doctorAmka,
        admissionDate,
        dischargeDate,
        attachments: [...existingAttachments, ...pendingFiles.map((file) => file.name)],
        links: links.length > 0 ? links : undefined,
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
      <Text style={loginStyles.inputLabel}>Αιτία Εισαγωγής</Text>
      <MedicalCodePicker
        category="Νοσηλίες"
        value={selectedCode}
        onChange={setSelectedCode}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <Text style={loginStyles.inputLabel}>Νοσοκομείο / Κλινική</Text>
      <HospitalPicker
        value={hospital}
        onChange={setHospital}
        inputStyle={[loginStyles.loginInput, formStyles.input]}
        resultsMaxHeight={PICKER_RESULTS_HEIGHT}
      />

      <DateField
        label="Ημερομηνία Εισαγωγής"
        value={admissionDate}
        onChange={setAdmissionDate}
        maximumDate={today}
      />

      <DateField
        label="Ημερομηνία Εξιτηρίου"
        value={dischargeDate}
        onChange={setDischargeDate}
        minimumDate={isoToDate(admissionDate) || undefined}
        maximumDate={today}
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

      <View style={{ marginTop: 20 }}>
        <RecordLinkPicker
          webId={params.webId}
          accessToken={accessToken}
          excludeCategory="Νοσηλίες"
          value={links}
          onChange={setLinks}
        />
      </View>
    </DoctorFormScreen>
  );
}
