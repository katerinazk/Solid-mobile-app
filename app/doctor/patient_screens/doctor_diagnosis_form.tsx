import React, { useState } from 'react';
import { Text, View, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { MedicalCodePicker } from '../../../components/MedicalCodePicker';
import { MedicalCode, codeFromRecord } from '../../../services/medicalCodes';

// Η φόρμα διάγνωσης ζει σε δική της οθόνη και όχι σε αναδυόμενο παράθυρο: η αναζήτηση στο
// ICD-10 βγάζει δεκάδες αποτελέσματα και σε παράθυρο δεν χωρούσαν.
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

      const fileUrl = params.editUrl || `${folderUrl}${params.category}_${Date.now()}.json`;
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
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>{isEditing ? 'Επεξεργασία' : 'Νέα Διάγνωση'}</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{params.amka}</Text></Text>

      <View style={{ flex: 1, paddingHorizontal: SPACING.sideMargin }}>
        <Text style={loginStyles.inputLabel}>Όνομα/Κωδικός</Text>
        <MedicalCodePicker
          category="Διαγνώσεις"
          value={selectedCode}
          onChange={setSelectedCode}
          inputStyle={[loginStyles.loginInput, localStyles.input]}
          resultsMaxHeight={420}
        />
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <TouchableOpacity
          style={[styles.addButton, { borderRadius: 25, marginBottom: 0 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Αποθήκευση</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
});
