import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { EXAM_FILTERS as CATEGORIES } from '../../../constants/medicalOptions';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord } from '../../../utils/podRecords';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl, getOwnerWebId, uploadAttachment, downloadAttachment } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Εξετάσεις';

interface Exam {
  url: string;
  title: string;
  type: string;
  status: 'pending' | 'completed';
  doctorName: string;
  doctorAmka: string;
  completedDate?: string;
  // Η εγγραφή ιστορικού στην οποία οφείλεται η εξέταση. Προαιρετική.
  links?: LinkedRecord[];
  resultFile?: string;
  // Ημερομηνία καταχώρησης της εξέτασης (όχι ολοκλήρωσης).
  createdDate?: string;
  // Κωδικός του διεθνούς προτύπου (ICD-10 / ATC / LOINC) και η κατηγορία στην οποία ανήκει,
  // όπως τα κατέγραψε ο γιατρός. Λείπουν από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

// Οι εκκρεμείς εξετάσεις δεν είχαν ημερομηνία. Τα αρχεία όμως ονομάζονται με το timestamp της
// στιγμής που δημιουργήθηκαν (Date.now().json), οπότε οι παλιές εγγραφές - που δεν έχουν
// createdDate μέσα τους - παίρνουν την ημερομηνία από το ίδιο το όνομα του αρχείου.
function createdDateFromUrl(url: string): string {
  const timestamp = Number(url.split('/').pop()?.replace('.json', ''));
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function PendingExamCard({ item, doctorDisplayName, uploading, onUpload, onDelete, onOpen }: { item: Exam; doctorDisplayName: string; uploading: boolean; onUpload: (item: Exam) => void; onDelete: (item: Exam) => void; onOpen: (item: Exam) => void }) {
  return (
    // Η κάρτα ανοίγει την αναλυτική προβολή. Τα κουμπιά μέσα της κρατούν το δικό τους πάτημα.
    <TouchableOpacity style={doctorStyles.diagnosisCard} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
      </View>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Τύπος: </Text>{item.type}
      </Text>
      {!!item.createdDate && (
        <Text style={doctorStyles.diagnosisCardDetail}>
          <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Καταχώρησης: </Text>{formatDate(item.createdDate)}
        </Text>
      )}
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>

      <TouchableOpacity
        style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginTop: 12 }]}
        onPress={() => onUpload(item)}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
            <Text style={doctorStyles.diagnosisSortButtonText}>Μεταφόρτωση Αποτελεσμάτων</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[doctorStyles.diagnosisSortButton, { marginHorizontal: 0, marginBottom: 0 }]}
        onPress={() => onDelete(item)}
      >
        <Text style={doctorStyles.diagnosisSortButtonText}>Διαγραφή</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function CompletedExamCard({ item, onOpen }: { item: Exam; onOpen: (item: Exam) => void }) {
  return (
    <TouchableOpacity
      style={[doctorStyles.diagnosisCard, { flexDirection: 'row', alignItems: 'center' }]}
      onPress={() => onOpen(item)}
    >
      <Ionicons name="link-outline" size={22} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <Text style={doctorStyles.diagnosisCardDetail}>
          <Text style={doctorStyles.diagnosisCardLabel}>Τύπος: </Text>{item.type}
        </Text>
        <Text style={[doctorStyles.diagnosisCardDetail, { marginTop: 2 }]}>
          <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Αποτελέσματος: </Text>{item.completedDate ? formatDate(item.completedDate) : ''}
        </Text>
        </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
    </TouchableOpacity>
  );
}

export default function PatientExamsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [selectedCategory, setSelectedCategory] = useState('Όλες');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const loadExams = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί εξετάσεις.
          files = [];
        }
      }

      const examFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(examFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
          if (!isCompleteRecord('Εξετάσεις', record)) return null;
          return {
            url,
            title: record.title,
            code: record.code,
            parentName: record.parentName,
            type: record.type,
            status: record.status,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            completedDate: record.completedDate,
            links: readLinks(record),
            resultFile: record.resultFile,
            createdDate: record.createdDate || createdDateFromUrl(url),
          } as Exam;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((e): e is Exam => e !== null);
      setExams(valid);
      ensureDoctorInfo(valid.map((e) => e.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setExams([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadExams);

  const displayDoctorName = (item: Exam) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const handleUploadResult = async (item: Exam) => {
    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingFor(item.url);

      await uploadAttachment(item.url, asset.name, asset.uri, asset.mimeType || 'application/octet-stream', accessToken);

      const today = new Date();
      const completedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const record = {
        title: item.title,
        type: item.type,
        status: 'completed' as const,
        doctorName: item.doctorName,
        doctorAmka: item.doctorAmka,
        completedDate,
        resultFile: asset.name,
        // Διατηρούμε ημερομηνία και κωδικό LOINC - το ανέβασμα ξαναγράφει όλο το αρχείο.
        createdDate: item.createdDate,
        links: item.links,
        code: item.code,
        parentName: item.parentName,
      };

      await saveFileContent(item.url, accessToken, JSON.stringify(record));

      setExams((prev) => prev.map((e) => e.url === item.url ? { ...e, status: 'completed', completedDate, resultFile: asset.name } : e));
    } catch (error: any) {
      alert(error.message || "Αποτυχία μεταφόρτωσης αρχείου.");
    } finally {
      setUploadingFor(null);
    }
  };

  const openDetail = (item: Exam) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
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

  const { pendingExams, completedExams } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matchesCategory = (e: Exam) => {
      if (selectedCategory === 'Όλες') return true;
      return e.type === selectedCategory;
    };
    // Η αναζήτηση πιάνει και τον τύπο, ώστε πληκτρολογώντας π.χ. "αιματολογ" να βγαίνουν όλες
    // οι εξετάσεις αυτής της κατηγορίας - λειτουργεί μαζί με το επιλεγμένο φίλτρο, όχι αντί.
    const matchesSearch = (e: Exam) => {
      if (!query) return true;
      return e.title?.toLowerCase().includes(query) || e.type?.toLowerCase().includes(query);
    };
    const filtered = exams.filter((e) => matchesCategory(e) && matchesSearch(e));
    return {
      pendingExams: filtered.filter((e) => e.status === 'pending'),
      completedExams: filtered.filter((e) => e.status === 'completed'),
    };
  }, [exams, selectedCategory, searchQuery]);

  // Ίδια λογική με την οθόνη του γιατρού: όσο υπάρχει αναζήτηση ανοίγουμε αυτόματα και τις
  // "Ολοκληρωμένες", αλλιώς ένα αποτέλεσμα εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
  const completedSectionOpen = showCompleted || (searchQuery.trim().length > 0 && completedExams.length > 0);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εξετάσεις</Text>
      </View>

      <View style={{ width: '70%', alignSelf: 'center', marginTop: SPACING.sectionGap, marginBottom: SPACING.groupGap }}>
        <Text style={doctorStyles.dashboardLabel}>Αναζήτηση εξέτασης:</Text>
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

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Εκκρεμείς</Text>

          {pendingExams.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
              {searchQuery.trim() ? 'Δεν βρέθηκε εκκρεμής εξέταση με αυτά τα στοιχεία.' : 'Δεν υπάρχουν εκκρεμείς εξετάσεις.'}
            </Text>
          ) : (
            pendingExams.map((item) => (
              <PendingExamCard
                key={item.url}
                item={item}
                doctorDisplayName={displayDoctorName(item)}
                uploading={uploadingFor === item.url}
                onUpload={handleUploadResult}
                onDelete={handleDeleteExam}
                onOpen={openDetail}
              />
            ))
          )}

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap }}
            onPress={() => setShowCompleted((prev) => !prev)}
          >
            <Ionicons name={completedSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Ολοκληρωμένες</Text>
          </TouchableOpacity>

          {completedSectionOpen && (
            <View style={{ marginTop: 12 }}>
              {completedExams.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
                  {searchQuery.trim() ? 'Δεν βρέθηκε ολοκληρωμένη εξέταση με αυτά τα στοιχεία.' : 'Δεν υπάρχουν ολοκληρωμένες εξετάσεις.'}
                </Text>
              ) : (
                completedExams.map((item) => (
                  <CompletedExamCard key={item.url} item={item} onOpen={openDetail} />
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
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
