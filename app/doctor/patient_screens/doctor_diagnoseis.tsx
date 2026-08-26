import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { calculateAge, formatDate } from '../../../utils/age';
import { SPACING } from '../../../constants/designSystem';

type Category = 'adult' | 'child';

interface Diagnosis {
  url: string;
  title: string;
  date: string;
  doctorName: string;
  doctorAmka: string;
  category: Category;
}

export default function DoctorDiagnoseisScreen() {
  const { amka, firstName, lastName, webId, birthDate } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const patientName = `${firstName} ${lastName}`;
  const folderUrl = webId ? getCategoryFolderUrl(webId, 'Διαγνώσεις') : '';

  const patientCategory: Category = calculateAge(birthDate) >= 18 ? 'adult' : 'child';
  const [activeCategory, setActiveCategory] = useState<Category>(patientCategory);

  const [loading, setLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [newestFirst, setNewestFirst] = useState(true);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newDiagnosisTitle, setNewDiagnosisTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState<Diagnosis | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const loadDiagnoses = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      const files = await listFolderFiles(folderUrl, accessToken);
      const diagnosisFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(diagnosisFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return { url, title: record.title, date: record.date, doctorName: record.doctorName, doctorAmka: record.doctorAmka, category: record.category } as Diagnosis;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((d): d is Diagnosis => d !== null);
      valid.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDiagnoses(valid);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const visibleDiagnoses = useMemo(() => {
    const filtered = diagnoses.filter((d) => d.category === activeCategory);
    return filtered.sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [diagnoses, activeCategory, newestFirst]);

  const canAddDiagnosis = activeCategory === patientCategory;

  const handleSaveDiagnosis = async () => {
    if (newDiagnosisTitle.trim() === '') {
      alert("Παρακαλώ γράψτε τη διάγνωση!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
      const doctorName = doctorData ? `Δρ. ${doctorData.last_name}` : 'Δρ.';

      const record = {
        title: newDiagnosisTitle.trim(),
        date: new Date().toISOString(),
        doctorName,
        doctorAmka: loggedInDoctorAmka,
        category: patientCategory,
      };

      const fileUrl = `${folderUrl}${patientCategory}_${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      setDiagnoses((prev) => [{ url: fileUrl, ...record }, ...prev]);
      setActiveCategory(patientCategory);
      setIsAddModalVisible(false);
      setNewDiagnosisTitle('');
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditDiagnosis = (item: Diagnosis) => {
    setEditDiagnosis(item);
    setEditTitle(item.title);
    setIsEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editDiagnosis || editTitle.trim() === '') {
      alert("Παρακαλώ γράψτε τη διάγνωση!");
      return;
    }

    try {
      setSaving(true);
      const record = { title: editTitle.trim(), date: editDiagnosis.date, doctorName: editDiagnosis.doctorName, doctorAmka: editDiagnosis.doctorAmka, category: editDiagnosis.category };
      await saveFileContent(editDiagnosis.url, accessToken, JSON.stringify(record));

      setDiagnoses((prev) => prev.map((d) => d.url === editDiagnosis.url ? { ...d, title: record.title } : d));
      setIsEditModalVisible(false);
      setEditDiagnosis(null);
    } catch (error: any) {
      alert(error.message || "Σφάλμα σύνδεσης.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDiagnosis = (item: Diagnosis) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη διάγνωση;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setDiagnoses((prev) => prev.filter((d) => d.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Διαγνώσεις</Text>
      </View>

      <View style={doctorStyles.diagnosisCategoryRow}>
        <TouchableOpacity
          style={[doctorStyles.diagnosisCategoryButton, activeCategory === 'adult' ? doctorStyles.diagnosisCategoryButtonActive : doctorStyles.diagnosisCategoryButtonInactive]}
          onPress={() => setActiveCategory('adult')}
        >
          <Text style={doctorStyles.diagnosisCategoryButtonText}>Ενήλικες</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[doctorStyles.diagnosisCategoryButton, activeCategory === 'child' ? doctorStyles.diagnosisCategoryButtonActive : doctorStyles.diagnosisCategoryButtonInactive]}
          onPress={() => setActiveCategory('child')}
        >
          <Text style={doctorStyles.diagnosisCategoryButtonText}>Παιδικές</Text>
        </TouchableOpacity>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {canAddDiagnosis && (
          <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => setIsAddModalVisible(true)}>
            <Text style={styles.addButtonText}>+ Προσθήκη Διάγνωσης</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setNewestFirst((prev) => !prev)}>
          <Text style={doctorStyles.diagnosisSortButtonText}>
            ↕ {newestFirst ? 'Νεότερες προς Παλαιότερες' : 'Παλαιότερες προς Νεότερες'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : visibleDiagnoses.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν διαγνώσεις.</Text>
      ) : (
        <FlatList
          data={visibleDiagnoses}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                {/* TODO: αφαίρεση fallback - προσωρινό ξέσκαρτισμα παλιών εγγραφών χωρίς doctorAmka */}
                {(item.doctorAmka === loggedInDoctorAmka || !item.doctorAmka) && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => handleEditDiagnosis(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteDiagnosis(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία: </Text>{formatDate(item.date)}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
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
            <Text style={styles.addmodalTitle}>Νέα Διάγνωση</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              placeholder="Γράψτε τη διάγνωση εδώ..."
              value={newDiagnosisTitle}
              onChangeText={setNewDiagnosisTitle}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsAddModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveDiagnosis}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Αποθήκευση</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Επεξεργασία Διάγνωσης</Text>

            <TextInput
              style={styles.textArea}
              multiline={true}
              numberOfLines={4}
              value={editTitle}
              onChangeText={setEditTitle}
            />

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Αποθήκευση</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
