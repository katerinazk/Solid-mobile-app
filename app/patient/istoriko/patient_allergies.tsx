import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { fetchPatientByAmka } from '../../../services/patients';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Αλλεργίες';

interface Allergy {
  url: string;
  title: string;
  reaction: string;
  doctorName: string;
  doctorAmka: string;
}

export default function PatientAllergiesScreen() {
  const { accessToken, loggedInPatientAmka, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [loading, setLoading] = useState(false);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [patientInfo, setPatientInfo] = useState<{ last_name: string; sex: string | null } | null>(null);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingAllergy, setEditingAllergy] = useState<Allergy | null>(null);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formReaction, setFormReaction] = useState('');

  useEffect(() => {
    fetchPatientByAmka(loggedInPatientAmka).then(({ data }) => setPatientInfo(data)).catch(() => {});
  }, []);

  const loadAllergies = async () => {
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
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί αλλεργίες.
          files = [];
        }
      }

      const allergyFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(allergyFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            reaction: record.reaction,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
          } as Allergy;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((a): a is Allergy => a !== null);
      setAllergies(valid);
      ensureDoctorInfo(valid.map((a) => a.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setAllergies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllergies();
  }, []);

  const displayDoctorName = (item: Allergy) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const resetForm = () => {
    setFormTitle('');
    setFormReaction('');
  };

  const openAddModal = () => {
    setEditingAllergy(null);
    resetForm();
    setIsAddModalVisible(true);
  };

  const closeModal = () => {
    setIsAddModalVisible(false);
    setEditingAllergy(null);
  };

  const handleEditAllergy = (item: Allergy) => {
    setEditingAllergy(item);
    setFormTitle(item.title);
    setFormReaction(item.reaction);
    setIsAddModalVisible(true);
  };

  const handleSaveAllergy = async () => {
    if (!formTitle.trim() || !formReaction.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      let doctorName = editingAllergy?.doctorName || '';
      let doctorAmka = editingAllergy?.doctorAmka || '';
      if (!editingAllergy) {
        // Ο ασθενής καταχωρεί μόνος του την αλλεργία - "κος/κα" αντί για "Δρ.".
        const salutation = patientInfo?.sex?.trim().toLowerCase().startsWith('γυναίκ') ? 'κα' : 'κος';
        doctorName = `${salutation} ${patientInfo?.last_name || ''}`.trim();
        doctorAmka = loggedInPatientAmka;
      }

      const record = { title: formTitle.trim(), reaction: formReaction.trim(), doctorName, doctorAmka };

      const fileUrl = editingAllergy ? editingAllergy.url : `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      if (editingAllergy) {
        setAllergies((prev) => prev.map((a) => a.url === fileUrl ? { url: fileUrl, ...record } : a));
      } else {
        setAllergies((prev) => [{ url: fileUrl, ...record }, ...prev]);
      }

      closeModal();
      resetForm();
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllergy = (item: Allergy) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την αλλεργία;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setAllergies((prev) => prev.filter((a) => a.url !== item.url));
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
        <Text style={doctorStyles.historyTitle}>Αλλεργίες</Text>
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Προσθήκη Αλλεργίας</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : allergies.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν υπάρχουν αλλεργίες ακόμα.</Text>
      ) : (
        <FlatList
          data={allergies}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingTop: SPACING.sectionGap, paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                {item.doctorAmka === loggedInPatientAmka && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => handleEditAllergy(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteAllergy(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αντίδραση: </Text>{item.reaction}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
              </Text>
            </View>
          )}
        />
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
                {editingAllergy ? 'Επεξεργασία Αλλεργίας' : 'Νέα Αλλεργία'}
              </Text>
              <TouchableOpacity
                onPress={closeModal}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formTitle} onChangeText={setFormTitle} />

            <Text style={loginStyles.inputLabel}>Αντίδραση</Text>
            <TextInput
              style={[styles.textArea, localStyles.input, { height: 130 }]}
              multiline
              value={formReaction}
              onChangeText={setFormReaction}
            />

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveAllergy}
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
