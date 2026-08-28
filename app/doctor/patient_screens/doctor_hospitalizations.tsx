import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { formatDate } from '../../../utils/age';

const CATEGORY = 'Νοσηλίες';

interface Hospitalization {
  url: string;
  title: string;
  hospitalClinic: string;
  doctorName: string;
  doctorAmka: string;
  admissionDate: string;
  dischargeDate: string;
}

// Χτίζει μια ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ ψηφίο-ψηφίο σε ξεχωριστά κομμάτια (ημέρα/μήνας/έτος),
// με την ίδια έξυπνη λογική που χρησιμοποιούμε και στους Εμβολιασμούς (auto-συμπλήρωση
// μηδενικού όταν το πρώτο ψηφίο δεν αφήνει περιθώριο για δεύτερο).
function createDateHandler(
  day: string, setDay: (v: string) => void,
  month: string, setMonth: (v: string) => void,
  year: string, setYear: (v: string) => void,
  currentValue: string
) {
  return (text: string) => {
    const isDeleting = text.length < currentValue.length;

    if (isDeleting) {
      if (year) setYear(year.slice(0, -1));
      else if (month) setMonth(month.slice(0, -1));
      else if (day) setDay(day.slice(0, -1));
      return;
    }

    const newDigit = text.slice(-1);
    if (!/[0-9]/.test(newDigit)) return;

    if (day.length < 2) {
      if (day.length === 1) {
        if (day === '3' && newDigit !== '0' && newDigit !== '1') return;
        setDay(day + newDigit);
        return;
      }
      setDay(Number(newDigit) >= 4 ? `0${newDigit}` : newDigit);
      return;
    }
    if (month.length < 2) {
      const next = month + newDigit;
      setMonth(next.length === 1 && Number(next) >= 2 ? `0${next}` : next);
      return;
    }
    if (year.length < 4) {
      setYear(year + newDigit);
    }
  };
}

export default function DoctorHospitalizationsScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [loading, setLoading] = useState(false);
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formHospitalClinic, setFormHospitalClinic] = useState('');

  const [admDay, setAdmDay] = useState('');
  const [admMonth, setAdmMonth] = useState('');
  const [admYear, setAdmYear] = useState('');
  const formAdmissionDate = admDay + (admMonth ? `/${admMonth}` : '') + (admYear ? `/${admYear}` : '');
  const handleAdmissionDateChange = createDateHandler(admDay, setAdmDay, admMonth, setAdmMonth, admYear, setAdmYear, formAdmissionDate);

  const [disDay, setDisDay] = useState('');
  const [disMonth, setDisMonth] = useState('');
  const [disYear, setDisYear] = useState('');
  const formDischargeDate = disDay + (disMonth ? `/${disMonth}` : '') + (disYear ? `/${disYear}` : '');
  const handleDischargeDateChange = createDateHandler(disDay, setDisDay, disMonth, setDisMonth, disYear, setDisYear, formDischargeDate);

  const loadHospitalizations = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - θα δημιουργηθεί αυτόματα με την πρώτη
          // νοσηλία που θα προστεθεί. Μέχρι τότε δείχνουμε απλώς άδεια λίστα.
          files = [];
        }
      }

      const hospitalizationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(hospitalizationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            hospitalClinic: record.hospitalClinic,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            admissionDate: record.admissionDate,
            dischargeDate: record.dischargeDate,
          } as Hospitalization;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((h): h is Hospitalization => h !== null);
      setHospitalizations(valid);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormHospitalClinic('');
    setAdmDay(''); setAdmMonth(''); setAdmYear('');
    setDisDay(''); setDisMonth(''); setDisYear('');
  };

  const handleSaveHospitalization = async () => {
    if (!formTitle.trim() || !formHospitalClinic.trim() || !formAdmissionDate.trim() || !formDischargeDate.trim()) {
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

      const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
      const doctorName = doctorData
        ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
        : 'Δρ.';

      const record = {
        title: formTitle.trim(),
        hospitalClinic: formHospitalClinic.trim(),
        doctorName,
        doctorAmka: loggedInDoctorAmka,
        admissionDate: `${admYear}-${admMonth}-${admDay}`,
        dischargeDate: `${disYear}-${disMonth}-${disDay}`,
      };

      const fileUrl = `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      setHospitalizations((prev) => [{ url: fileUrl, ...record }, ...prev]);
      setIsAddModalVisible(false);
      resetForm();
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadHospitalizations();
  }, []);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Νοσηλίες</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Προσθήκη Νοσηλίας</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : hospitalizations.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν νοσηλίες.</Text>
      ) : (
        <FlatList
          data={hospitalizations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Νοσοκομείο / Κλινική: </Text>{item.hospitalClinic}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εισαγωγής: </Text>{formatDate(item.admissionDate)}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εξιτηρίου: </Text>{formatDate(item.dischargeDate)}
              </Text>

              <TouchableOpacity
                style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginBottom: 0, marginTop: 12 }]}
              >
                <Ionicons name="link-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={doctorStyles.diagnosisSortButtonText}>Συνημμένα Αρχεία</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Νέα Νοσηλία</Text>
              <TouchableOpacity
                onPress={() => setIsAddModalVisible(false)}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formTitle} onChangeText={setFormTitle} />

            <Text style={loginStyles.inputLabel}>Νοσοκομείο / Κλινική</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formHospitalClinic} onChangeText={setFormHospitalClinic} />

            <Text style={loginStyles.inputLabel}>Ημερομηνία Εισαγωγής</Text>
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
              keyboardType="numeric"
              maxLength={10}
              value={formAdmissionDate}
              onChangeText={handleAdmissionDateChange}
            />

            <Text style={loginStyles.inputLabel}>Ημερομηνία Εξιτηρίου</Text>
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
              keyboardType="numeric"
              maxLength={10}
              value={formDischargeDate}
              onChangeText={handleDischargeDateChange}
            />

            {/* TODO: λειτουργία επισύναψης αρχείων - έρχεται σύντομα */}
            <TouchableOpacity
              style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0 }]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={doctorStyles.diagnosisSortButtonText}>Επισύναψη αρχείων</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveHospitalization}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addButtonText}>Εντάξει</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
