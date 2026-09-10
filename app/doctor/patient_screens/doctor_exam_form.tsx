import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { loginStyles } from '../../../constants/loginStyles';
import { TYPOGRAPHY } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { DoctorFormScreen, formStyles, PICKER_RESULTS_HEIGHT } from '../../../components/DoctorFormScreen';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';

const EXAM_TYPES = ['Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];

export default function DoctorExamFormScreen() {
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
    editDoctorName?: string;
    editDoctorAmka?: string;
  }>();

  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { checkAccess } = useDoctorAccessGuard(params.amka, params.accessType);
  const folderUrl = params.webId ? getCategoryFolderUrl(params.webId, 'Εξετάσεις') : '';

  const isEditing = !!params.editUrl;

  const [selectedCode, setSelectedCode] = useState<MedicalCode | null>(
    codeFromRecord({ code: params.editCode, title: params.editTitle, parentName: params.editParentName })
  );
  const [type, setType] = useState(params.editType || '');
  const [isTypeListVisible, setIsTypeListVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!selectedCode || !type.trim()) {
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
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const record = {
        title: selectedCode.name,
        code: selectedCode.code,
        parentName: selectedCode.parent_name || undefined,
        type,
        // Η ολοκλήρωση γίνεται από τον ασθενή, ανεβάζοντας το αποτέλεσμα - εδώ απλώς
        // διατηρούμε ό,τι ισχύει ήδη.
        status: (params.editStatus as 'pending' | 'completed') || 'pending',
        doctorName,
        doctorAmka,
        completedDate: params.editCompletedDate,
        resultFile: params.editResultFile,
        // Στην επεξεργασία κρατάμε την αρχική ημερομηνία καταχώρησης, δεν τη μηδενίζουμε.
        createdDate: params.editCreatedDate || todayIso,
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

      <Text style={loginStyles.inputLabel}>Τύπος</Text>
      <TouchableOpacity
        style={[loginStyles.loginInput, formStyles.input, { justifyContent: 'center', marginBottom: isTypeListVisible ? 0 : 30 }]}
        onPress={() => setIsTypeListVisible((prev) => !prev)}
      >
        <Text style={{ color: type ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
          {type || 'Επιλέξτε τύπο'}
        </Text>
      </TouchableOpacity>

      {isTypeListVisible && (
        <View style={localStyles.typeList}>
          {EXAM_TYPES.map((option, index) => (
            <TouchableOpacity
              key={option}
              style={[localStyles.typeOption, index === EXAM_TYPES.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { setType(option); setIsTypeListVisible(false); }}
            >
              <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </DoctorFormScreen>
  );
}

const localStyles = StyleSheet.create({
  typeList: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    marginBottom: 30,
    overflow: 'hidden',
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightest,
  },
});
