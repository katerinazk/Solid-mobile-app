import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { listFolderFilesOrEmpty, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Φάρμακα';

interface Medication {
  url: string;
  title: string;
  dosage: string;
  startDate: string;
  durationDays: number;
  doctorName: string;
  doctorAmka: string;
  // false = ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη" στη δική του οθόνη (εμφανίζεται ως
  // "εκκρεμές" εκεί). undefined = παλιά εγγραφή από πριν υπάρξει αυτή η έννοια -> θεωρείται
  // ήδη ενεργή, όχι εκκρεμής.
  started?: boolean;
}

function MedicationCard({ item, doctorDisplayName, loggedInDoctorAmka, allowEdit, onEdit, onDelete }: { item: Medication; doctorDisplayName: string; loggedInDoctorAmka: string; allowEdit: boolean; onEdit: (item: Medication) => void; onDelete: (item: Medication) => void }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
        {allowEdit && item.doctorAmka === loggedInDoctorAmka && (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={() => onEdit(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDelete(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{item.durationDays} μέρες
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>
    </View>
  );
}

export default function DoctorMedicationsScreen() {
  const { amka, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  const [loading, setLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDosage, setFormDosage] = useState('');
  const [formDurationDays, setFormDurationDays] = useState('');

  const loadMedications = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

      const medicationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(medicationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            dosage: record.dosage,
            startDate: record.startDate,
            durationDays: record.durationDays,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            started: record.started,
          } as Medication;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((m): m is Medication => m !== null);
      setMedications(valid);
      ensureDoctorInfo(valid.map((m) => m.doctorAmka));
    } catch (error: any) {
      // 403 από το Pod = ο ασθενής κατάργησε την πρόσβαση όσο ο γιατρός ήταν μέσα. Το αναλαμβάνει
      // ο φύλακας, που βγάζει το σωστό μήνυμα και τον επιστρέφει στην αρχική του.
      if (isPodAccessDenied(error)) {
        checkAccess();
        return;
      }
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  const displayDoctorName = (item: Medication) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const resetForm = () => {
    setFormTitle('');
    setFormDosage('');
    setFormDurationDays('');
  };

  const openAddModal = () => {
    setEditingMedication(null);
    resetForm();
    setIsAddModalVisible(true);
  };

  const closeModal = () => {
    setIsAddModalVisible(false);
    setEditingMedication(null);
  };

  const handleEditMedication = (item: Medication) => {
    setEditingMedication(item);
    setFormTitle(item.title);
    setFormDosage(item.dosage);
    setFormDurationDays(String(item.durationDays));
    setIsAddModalVisible(true);
  };

  const handleSaveMedication = async () => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    if (!formTitle.trim() || !formDosage.trim() || !formDurationDays.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    const durationDays = Number(formDurationDays);
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      alert("Η διάρκεια χορήγησης πρέπει να είναι θετικός αριθμός ημερών.");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      let doctorName = editingMedication?.doctorName || '';
      let doctorAmka = editingMedication?.doctorAmka || '';
      if (!editingMedication) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      let startDate = editingMedication?.startDate || '';
      if (!editingMedication) {
        const today = new Date();
        startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }

      // Νέα εγγραφή -> ξεκινάει "εκκρεμής" (started: false) μέχρι ο ασθενής να πατήσει
      // "Έναρξη" στη δική του οθόνη. Επεξεργασία -> διατηρεί ό,τι ίσχυε ήδη.
      const started = editingMedication ? editingMedication.started : false;

      const record = {
        title: formTitle.trim(),
        dosage: formDosage.trim(),
        startDate,
        durationDays,
        doctorName,
        doctorAmka,
        started,
      };

      const fileUrl = editingMedication ? editingMedication.url : `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      if (editingMedication) {
        setMedications((prev) => prev.map((m) => m.url === fileUrl ? { url: fileUrl, ...record } : m));
      } else {
        setMedications((prev) => [{ url: fileUrl, ...record }, ...prev]);
      }

      closeModal();
      resetForm();
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedication = async (item: Medication) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το φάρμακο;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setMedications((prev) => prev.filter((m) => m.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
  };

  const { activeMedications, previousMedications } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const query = searchQuery.trim().toLowerCase();

    const active: Medication[] = [];
    const previous: Medication[] = [];

    for (const med of medications) {
      if (query && !med.title?.toLowerCase().includes(query)) continue;

      const endDate = new Date(med.startDate);
      endDate.setDate(endDate.getDate() + (med.durationDays || 0));
      if (endDate >= today) {
        active.push(med);
      } else {
        previous.push(med);
      }
    }

    return { activeMedications: active, previousMedications: previous };
  }, [medications, searchQuery]);

  // Όταν ο γιατρός ψάχνει κάτι, ανοίγουμε αυτόματα και την "Προηγούμενη Αγωγή" - αλλιώς ένα
  // αποτέλεσμα που βρίσκεται εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
  const previousSectionOpen = showPrevious || (searchQuery.trim().length > 0 && previousMedications.length > 0);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Φάρμακα</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {!isReadOnly && (
          <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddModal}>
            <Text style={styles.addButtonText}>+ Προσθήκη Φαρμάκου</Text>
          </TouchableOpacity>
        )}

        <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.sectionGap }}>
          <Text style={doctorStyles.dashboardLabel}>Αναζήτηση φαρμάκου:</Text>
          <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <TextInput
              style={doctorStyles.searchInput}
              placeholder="Αναζήτηση..."
              placeholderTextColor={COLORS.primary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ενεργή Αγωγή</Text>

          {activeMedications.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ενεργές αγωγές.</Text>
          ) : (
            activeMedications.map((item) => <MedicationCard key={item.url} item={item} doctorDisplayName={displayDoctorName(item)} loggedInDoctorAmka={loggedInDoctorAmka} allowEdit={!isReadOnly} onEdit={handleEditMedication} onDelete={handleDeleteMedication} />)
          )}

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10 }}
            onPress={() => setShowPrevious((prev) => !prev)}
          >
            <Ionicons name={previousSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
          </TouchableOpacity>

          {previousSectionOpen && (
            <View style={{ marginTop: 12 }}>
              {previousMedications.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν προηγούμενες αγωγές.</Text>
              ) : (
                previousMedications.map((item) => <MedicationCard key={item.url} item={item} doctorDisplayName={displayDoctorName(item)} loggedInDoctorAmka={loggedInDoctorAmka} allowEdit={false} onEdit={handleEditMedication} onDelete={handleDeleteMedication} />)
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>
                {editingMedication ? 'Επεξεργασία Φαρμάκου' : 'Νέο Φάρμακο'}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formTitle} onChangeText={setFormTitle} />

            <Text style={loginStyles.inputLabel}>Δοσολογία</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formDosage} onChangeText={setFormDosage} />

            <Text style={loginStyles.inputLabel}>Διάρκεια Χορήγησης</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
              <TextInput
                style={[loginStyles.loginInput, localStyles.input, localStyles.durationInput]}
                keyboardType="numeric"
                value={formDurationDays}
                onChangeText={(text) => setFormDurationDays(text.replace(/[^0-9]/g, ''))}
              />
              <Text style={[loginStyles.inputLabel, { marginLeft: 10, marginBottom: 0 }]}>Ημέρες</Text>
            </View>

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveMedication}
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
  durationInput: {
    width: 80,
    marginBottom: 0,
    textAlign: 'center',
  },
});
