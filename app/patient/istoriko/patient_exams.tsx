import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
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
}

function PendingExamCard({ item, doctorDisplayName }: { item: Exam; doctorDisplayName: string }) {
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
        onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}
      >
        <Ionicons name="cloud-upload-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
        <Text style={doctorStyles.diagnosisSortButtonText}>Μεταφόρτωση Αποτελεσμάτων</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[doctorStyles.diagnosisSortButton, { marginHorizontal: 0, marginBottom: 0 }]}
        onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}
      >
        <Text style={doctorStyles.diagnosisSortButtonText}>Διαγραφή</Text>
      </TouchableOpacity>
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

export default function PatientExamsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [selectedCategory, setSelectedCategory] = useState('Εκκρεμείς');
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);

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
            pendingExams.map((item) => <PendingExamCard key={item.url} item={item} doctorDisplayName={displayDoctorName(item)} />)
          )}

          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ολοκληρωμένες</Text>

          {completedExams.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ολοκληρωμένες εξετάσεις.</Text>
          ) : (
            completedExams.map((item) => <CompletedExamCard key={item.url} item={item} />)
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
