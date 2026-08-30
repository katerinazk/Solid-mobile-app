import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl } from '../../../services/solidPod';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { formatDate } from '../../../utils/age';

const CATEGORY = 'Εξετάσεις';
const CATEGORIES = ['Όλες', 'Εκκρεμείς', 'Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];
const EXAM_TYPES = ['Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];

interface Exam {
  url: string;
  title: string;
  type: string;
  status: 'pending' | 'completed';
  doctorName: string;
  doctorAmka: string;
  completedDate?: string;
}

function PendingExamCard({ item, loggedInDoctorAmka, onEdit, onDelete }: { item: Exam; loggedInDoctorAmka: string; onEdit: (item: Exam) => void; onDelete: (item: Exam) => void }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
        {item.doctorAmka === loggedInDoctorAmka && (
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
        <Text style={doctorStyles.diagnosisCardLabel}>Τύπος: </Text>{item.type}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
      </Text>
      <Text style={[doctorStyles.diagnosisCardDetail, { color: COLORS.danger, fontWeight: 'bold', marginTop: 10 }]}>ΕΚΚΡΕΜΕΣ</Text>
    </View>
  );
}

function CompletedExamCard({ item }: { item: Exam }) {
  return (
    <View style={[doctorStyles.diagnosisCard, { flexDirection: 'row', alignItems: 'center' }]}>
      <Ionicons name="link-outline" size={22} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[doctorStyles.diagnosisCardTitle, { marginRight: 0 }]}>{item.title}</Text>
        <Text style={[doctorStyles.diagnosisCardDetail, { color: COLORS.text, marginTop: 2 }]}>{item.completedDate ? formatDate(item.completedDate) : ''}</Text>
      </View>
    </View>
  );
}

export default function DoctorExamsScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [selectedCategory, setSelectedCategory] = useState('Όλες');
  const [showCompleted, setShowCompleted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [isTypeListVisible, setIsTypeListVisible] = useState(false);

  const loadExams = async () => {
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
          // εξέταση που θα προστεθεί. Μέχρι τότε δείχνουμε απλώς άδεια λίστα.
          files = [];
        }
      }

      const examFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(examFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            type: record.type,
            status: record.status,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            completedDate: record.completedDate,
          } as Exam;
        } catch {
          return null;
        }
      }));

      setExams(loaded.filter((e): e is Exam => e !== null));
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const { pendingExams, completedExams } = useMemo(() => ({
    pendingExams: exams.filter((e) => e.status === 'pending'),
    completedExams: exams.filter((e) => e.status === 'completed'),
  }), [exams]);

  const openAddModal = () => {
    setEditingExam(null);
    setFormName('');
    setFormType('');
    setIsTypeListVisible(false);
    setIsAddModalVisible(true);
  };

  const closeModal = () => {
    setIsAddModalVisible(false);
    setEditingExam(null);
    setIsTypeListVisible(false);
  };

  const handleEditExam = (item: Exam) => {
    setEditingExam(item);
    setFormName(item.title);
    setFormType(item.type);
    setIsTypeListVisible(false);
    setIsAddModalVisible(true);
  };

  const handleSelectType = (type: string) => {
    setFormType(type);
    setIsTypeListVisible(false);
  };

  const handleDeleteExam = (item: Exam) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εξέταση;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setExams((prev) => prev.filter((e) => e.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
  };

  const handleSaveExam = async () => {
    if (!formName.trim() || !formType.trim()) {
      alert("Παρακαλώ συμπληρώστε όλα τα πεδία!");
      return;
    }

    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      setSaving(true);

      let doctorName = editingExam?.doctorName || '';
      let doctorAmka = editingExam?.doctorAmka || '';
      if (!editingExam) {
        const { data: doctorData } = await fetchDoctorByAmka(loggedInDoctorAmka);
        doctorName = doctorData
          ? `Δρ. ${doctorData.last_name} ${doctorData.first_name} (${doctorData.specialty})`
          : 'Δρ.';
        doctorAmka = loggedInDoctorAmka;
      }

      const record = {
        title: formName.trim(),
        type: formType,
        status: editingExam?.status || ('pending' as const),
        doctorName,
        doctorAmka,
        completedDate: editingExam?.completedDate,
      };

      const fileUrl = editingExam ? editingExam.url : `${folderUrl}${Date.now()}.json`;
      await saveFileContent(fileUrl, accessToken, JSON.stringify(record));

      if (editingExam) {
        setExams((prev) => prev.map((e) => e.url === fileUrl ? { url: fileUrl, ...record } : e));
      } else {
        setExams((prev) => [{ url: fileUrl, ...record }, ...prev]);
      }

      closeModal();
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
        <Text style={doctorStyles.historyTitle}>Εξετάσεις</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.groupGap }}>
        <Text style={doctorStyles.dashboardLabel}>Αναζήτηση εξέτασης:</Text>
        <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.groupGap }}
        style={{ flexGrow: 0, marginBottom: SPACING.groupGap }}
      >
        {CATEGORIES.map((category) => {
          const isSelected = category === selectedCategory;
          return (
            <TouchableOpacity
              key={category}
              style={[localStyles.categoryPill, isSelected ? localStyles.categoryPillSelected : localStyles.categoryPillUnselected]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={isSelected ? localStyles.categoryPillTextSelected : localStyles.categoryPillTextUnselected}>{category}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εξέτασης</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Εκκρεμείς</Text>

          {pendingExams.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν εκκρεμείς εξετάσεις.</Text>
          ) : (
            pendingExams.map((item) => <PendingExamCard key={item.url} item={item} loggedInDoctorAmka={loggedInDoctorAmka} onEdit={handleEditExam} onDelete={handleDeleteExam} />)
          )}

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }}
            onPress={() => setShowCompleted((prev) => !prev)}
          >
            <Ionicons name={showCompleted ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Ολοκληρωμένες</Text>
          </TouchableOpacity>

          {showCompleted && (
            <View style={{ marginTop: 12 }}>
              {completedExams.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ολοκληρωμένες εξετάσεις.</Text>
              ) : (
                completedExams.map((item) => <CompletedExamCard key={item.url} item={item} />)
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
                {editingExam ? 'Επεξεργασία Εξέτασης' : 'Νέα Εξέταση'}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>Όνομα</Text>
            <TextInput style={[loginStyles.loginInput, localStyles.input]} value={formName} onChangeText={setFormName} />

            <Text style={loginStyles.inputLabel}>Τύπος</Text>
            <TouchableOpacity
              style={[loginStyles.loginInput, localStyles.input, { justifyContent: 'center', marginBottom: isTypeListVisible ? 0 : 30 }]}
              onPress={() => setIsTypeListVisible((prev) => !prev)}
            >
              <Text style={{ color: formType ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
                {formType || 'Επιλέξτε τύπο'}
              </Text>
            </TouchableOpacity>

            {isTypeListVisible && (
              <View style={localStyles.typeList}>
                {EXAM_TYPES.map((type, index) => (
                  <TouchableOpacity
                    key={type}
                    style={[localStyles.typeOption, index === EXAM_TYPES.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => handleSelectType(type)}
                  >
                    <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.addButton, { borderRadius: 25, marginBottom: 0, width: '60%', alignSelf: 'center' }]}
              onPress={handleSaveExam}
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
  categoryPill: {
    paddingHorizontal: 18,
    height: TOUCH.buttonHeight,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.groupGap,
  },
  categoryPillSelected: {
    backgroundColor: COLORS.lightest,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  categoryPillUnselected: {
    backgroundColor: COLORS.primary,
  },
  categoryPillTextSelected: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: TYPOGRAPHY.bodyText,
  },
  categoryPillTextUnselected: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: TYPOGRAPHY.bodyText,
  },
});
