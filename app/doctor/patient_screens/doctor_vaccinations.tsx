import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, getCategoryFolderUrl, ensureCategoryFolder } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { formatDate } from '../../../utils/age';

const CATEGORY = 'Εμβολιασμοί';

interface Vaccination {
  url: string;
  title: string;
  commercialName: string;
  doctorName: string;
  batchNumber: string;
  doseNumber: string;
  administeredDate: string;
}

export default function DoctorVaccinationsScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [loading, setLoading] = useState(false);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [newestFirst, setNewestFirst] = useState(true);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCommercialName, setFormCommercialName] = useState('');
  const [formBatchNumber, setFormBatchNumber] = useState('');
  const [formDoseNumber, setFormDoseNumber] = useState('');
  const [dateDay, setDateDay] = useState('');
  const [dateMonth, setDateMonth] = useState('');
  const [dateYear, setDateYear] = useState('');
  const formAdministeredDate = dateDay + (dateMonth ? `/${dateMonth}` : '') + (dateYear ? `/${dateYear}` : '');

  const loadVaccinations = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - τον δημιουργούμε και τον αφήνουμε κενό.
        await ensureCategoryFolder(webId, CATEGORY, accessToken);
        files = [];
      }

      const vaccinationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(vaccinationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            commercialName: record.commercialName,
            doctorName: record.doctorName,
            batchNumber: record.batchNumber,
            doseNumber: record.doseNumber,
            administeredDate: record.administeredDate,
          } as Vaccination;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((v): v is Vaccination => v !== null);
      setVaccinations(valid);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVaccinations();
  }, []);

  const sortedVaccinations = useMemo(() => {
    return [...vaccinations].sort((a, b) => {
      const diff = new Date(b.administeredDate).getTime() - new Date(a.administeredDate).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [vaccinations, newestFirst]);

  // Χτίζει την ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ ψηφίο-ψηφίο σε ξεχωριστά κομμάτια (ημέρα/μήνας/έτος).
  // Αν το πρώτο ψηφίο ημέρας είναι 4-9 (καμία μέρα δεν αρχίζει από 40-99) ή το πρώτο ψηφίο
  // μήνα είναι 2-9 (κανένας μήνας δεν αρχίζει από 20-99), το συμπληρώνει αυτόματα με μηδενικό
  // και προχωράει στο επόμενο κομμάτι - έτσι δεν χρειάζεται ο χρήστης να γράφει πάντα 2 ψηφία
  // (π.χ. "5" για μέρα 5), χωρίς να μπερδεύονται τα επόμενα ψηφία με λάθος κομμάτι.
  const handleDateChange = (text: string) => {
    const isDeleting = text.length < formAdministeredDate.length;

    if (isDeleting) {
      if (dateYear) setDateYear(dateYear.slice(0, -1));
      else if (dateMonth) setDateMonth(dateMonth.slice(0, -1));
      else if (dateDay) setDateDay(dateDay.slice(0, -1));
      return;
    }

    const newDigit = text.slice(-1);
    if (!/[0-9]/.test(newDigit)) return;

    if (dateDay.length < 2) {
      const next = dateDay + newDigit;
      setDateDay(next.length === 1 && Number(next) >= 4 ? `0${next}` : next);
      return;
    }
    if (dateMonth.length < 2) {
      const next = dateMonth + newDigit;
      setDateMonth(next.length === 1 && Number(next) >= 2 ? `0${next}` : next);
      return;
    }
    if (dateYear.length < 4) {
      setDateYear(dateYear + newDigit);
    }
  };

  const handleSaveVaccination = async () => {
    if (!formTitle.trim() || !formCommercialName.trim() || !formBatchNumber.trim() || !formDoseNumber.trim() || !formAdministeredDate.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (dateDay.length !== 2 || dateMonth.length !== 2 || dateYear.length !== 4) {
      alert("Παρακαλώ συμπληρώστε πλήρη ημερομηνία (ΗΗ/ΜΜ/ΕΕΕΕ).");
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
        commercialName: formCommercialName.trim(),
        doctorName,
        batchNumber: formBatchNumber.trim(),
        doseNumber: formDoseNumber.trim(),
        administeredDate: `${dateYear}-${dateMonth}-${dateDay}`,
      };

      const fileUrl = `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      setVaccinations((prev) => [{ url: fileUrl, ...record }, ...prev]);
      setIsAddModalVisible(false);
      setFormTitle('');
      setFormCommercialName('');
      setFormBatchNumber('');
      setFormDoseNumber('');
      setDateDay('');
      setDateMonth('');
      setDateYear('');
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
        <Text style={doctorStyles.historyTitle}>Εμβολιασμοί</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εμβολιασμού</Text>
        </TouchableOpacity>

        <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setNewestFirst((prev) => !prev)}>
          <Text style={doctorStyles.diagnosisSortButtonText}>
            ↕ {newestFirst ? 'Νεότεροι προς Παλαιότεροι' : 'Παλαιότεροι προς Νεότεροι'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : sortedVaccinations.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν εμβολιασμοί.</Text>
      ) : (
        <FlatList
          data={sortedVaccinations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Εμπορική Ονομασία: </Text>{item.commercialName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Παρτίδας: </Text>{item.batchNumber}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Δόσης: </Text>{item.doseNumber}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Χορήγησης: </Text>{formatDate(item.administeredDate)}
              </Text>
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
            <TouchableOpacity
              onPress={() => setIsAddModalVisible(false)}
              style={{ position: 'absolute', top: 15, right: 15, zIndex: 1 }}
              hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
            >
              <Ionicons name="close" size={22} color={COLORS.text} />
            </TouchableOpacity>

            <Text style={styles.addmodalTitle}>Νέος{'\n'}Εμβολιασμός</Text>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formTitle} onChangeText={setFormTitle} />

            <Text style={loginStyles.inputLabel}>Εμπορική Ονομασία</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formCommercialName} onChangeText={setFormCommercialName} />

            <Text style={loginStyles.inputLabel}>Αριθμός Παρτίδας</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formBatchNumber} onChangeText={setFormBatchNumber} />

            <Text style={loginStyles.inputLabel}>Αριθμός Δόσης</Text>
            <TextInput
              style={[loginStyles.loginInput, localStyles.input, { width: 70, paddingVertical: 10, marginBottom: 30 }]}
              keyboardType="numeric"
              value={formDoseNumber}
              onChangeText={(text) => setFormDoseNumber(text.replace(/[^0-9]/g, ''))}
            />

            <Text style={loginStyles.inputLabel}>Ημερομηνία Χορήγησης</Text>
            <TextInput
              style={[loginStyles.loginInput, localStyles.input]}
              placeholder="ΗΗ/ΜΜ/ΕΕΕΕ"
              keyboardType="numeric"
              maxLength={10}
              value={formAdministeredDate}
              onChangeText={handleDateChange}
            />

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveVaccination}
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
    borderRadius: 25,
  },
});
