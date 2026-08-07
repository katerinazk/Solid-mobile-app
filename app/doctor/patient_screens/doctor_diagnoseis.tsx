import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { calculateAge, formatDate } from '../../../utils/age';

type Category = 'adult' | 'child';

interface Diagnosis {
  url: string;
  title: string;
  date: string;
  doctorName: string;
  category: Category;
}

export default function DoctorDiagnoseisScreen() {
  const { amka, firstName, lastName, webId, birthDate } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const patientName = `${firstName} ${lastName}`;
  const folderUrl = (webId || '').replace('profile/card#me', 'public/');

  const patientCategory: Category = calculateAge(birthDate) >= 18 ? 'adult' : 'child';
  const [activeCategory, setActiveCategory] = useState<Category>(patientCategory);

  const [loading, setLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newDiagnosisTitle, setNewDiagnosisTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDiagnoses = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      const files = await listFolderFiles(webId, accessToken);
      const diagnosisFiles = files.filter((url) => decodeURIComponent(url.split('/').pop() || '').startsWith('diagnosis_'));

      const loaded = await Promise.all(diagnosisFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return { url, title: record.title, date: record.date, doctorName: record.doctorName, category: record.category } as Diagnosis;
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

  const visibleDiagnoses = useMemo(
    () => diagnoses.filter((d) => d.category === activeCategory),
    [diagnoses, activeCategory]
  );

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
        category: patientCategory,
      };

      const fileUrl = `${folderUrl}diagnosis_${patientCategory}_${Date.now()}.json`;
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

  return (
    <SafeAreaView style={doctorStyles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton}>
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

      <View style={{ paddingHorizontal: 20 }}>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAddModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Προσθήκη Διάγνωσης</Text>
        </TouchableOpacity>

        <TouchableOpacity style={doctorStyles.diagnosisSortButton}>
          <Text style={doctorStyles.diagnosisSortButtonText}>↕ Νεότερες προς Παλαιότερες</Text>
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
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                <Ionicons name="chatbox-ellipses-outline" size={22} color={COLORS.primary} />
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
    </SafeAreaView>
  );
}
