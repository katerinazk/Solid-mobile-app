import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl, getOwnerWebId, uploadAttachment, downloadAttachment } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { openLocalFile } from '../../../utils/openLocalFile';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Εξετάσεις';
const CATEGORIES = ['Όλες', 'Εκκρεμείς', 'Εργαστηριακές', 'Απεικονιστικές', 'Λειτουργικές', 'Ενδοσκοπικές', 'Ιστολογικές'];

interface Exam {
  url: string;
  title: string;
  type: string;
  status: 'pending' | 'completed';
  doctorName: string;
  doctorAmka: string;
  completedDate?: string;
  resultFile?: string;
}

function PendingExamCard({ item, doctorDisplayName, uploading, onUpload, onDelete }: { item: Exam; doctorDisplayName: string; uploading: boolean; onUpload: (item: Exam) => void; onDelete: (item: Exam) => void }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
        <Text style={{ color: COLORS.danger, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText }}>ΕΚΚΡΕΜΕΣ</Text>
      </View>
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
    </View>
  );
}

function CompletedExamCard({ item, opening, onOpen }: { item: Exam; opening: boolean; onOpen: (item: Exam) => void }) {
  return (
    <TouchableOpacity
      style={[doctorStyles.diagnosisCard, { flexDirection: 'row', alignItems: 'center' }]}
      onPress={() => onOpen(item)}
      disabled={!item.resultFile || opening}
    >
      <Ionicons name="link-outline" size={22} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={[doctorStyles.diagnosisCardTitle, { marginRight: 0 }]}>{item.title}</Text>
        <Text style={[doctorStyles.diagnosisCardDetail, { color: COLORS.text, marginTop: 2 }]}>{item.completedDate ? formatDate(item.completedDate) : ''}</Text>
      </View>
      {opening && <ActivityIndicator size="small" color={COLORS.primary} />}
    </TouchableOpacity>
  );
}

export default function PatientExamsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [selectedCategory, setSelectedCategory] = useState('Εκκρεμείς');
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [openingResultFor, setOpeningResultFor] = useState<string | null>(null);

  const loadExams = async () => {
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
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί εξετάσεις.
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
            resultFile: record.resultFile,
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

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
      };

      await saveFileContent(item.url, accessToken, JSON.stringify(record));

      setExams((prev) => prev.map((e) => e.url === item.url ? { ...e, status: 'completed', completedDate, resultFile: asset.name } : e));
    } catch (error: any) {
      alert(error.message || "Αποτυχία μεταφόρτωσης αρχείου.");
    } finally {
      setUploadingFor(null);
    }
  };

  const handleOpenResult = async (item: Exam) => {
    if (!item.resultFile) return;
    try {
      setOpeningResultFor(item.url);
      const localUri = await downloadAttachment(item.url, item.resultFile, accessToken);
      await openLocalFile(localUri, item.resultFile);
    } catch (error: any) {
      alert(error.message || 'Αποτυχία ανοίγματος αρχείου.');
    } finally {
      setOpeningResultFor(null);
    }
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

  const { pendingExams, completedExams } = useMemo(() => ({
    pendingExams: exams.filter((e) => e.status === 'pending'),
    completedExams: exams.filter((e) => e.status === 'completed'),
  }), [exams]);

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

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Εκκρεμείς</Text>

          {pendingExams.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν εκκρεμείς εξετάσεις.</Text>
          ) : (
            pendingExams.map((item) => (
              <PendingExamCard
                key={item.url}
                item={item}
                doctorDisplayName={displayDoctorName(item)}
                uploading={uploadingFor === item.url}
                onUpload={handleUploadResult}
                onDelete={handleDeleteExam}
              />
            ))
          )}

          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ολοκληρωμένες</Text>

          {completedExams.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ολοκληρωμένες εξετάσεις.</Text>
          ) : (
            completedExams.map((item) => (
              <CompletedExamCard key={item.url} item={item} opening={openingResultFor === item.url} onOpen={handleOpenResult} />
            ))
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
