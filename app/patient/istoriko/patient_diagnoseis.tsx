import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { SPACING } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, timeOf } from '../../../utils/podRecords';
import { groupByYearRetractedLast } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { useRecordSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { SortDropdown } from '../../../components/SortDropdown';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { fetchPatientByAmka } from '../../../services/patients';
import { calculateAge, formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

type Category = 'adult' | 'child';

interface Diagnosis {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
  title: string;
  date: string;
  doctorName: string;
  doctorAmka: string;
  category: Category;
  // Κωδικός ICD-10 και η κατηγορία στην οποία ανήκει, όπως τα κατέγραψε ο γιατρός. Λείπουν
  // από τις παλιές εγγραφές, που ήταν ελεύθερο κείμενο.
  code?: string;
  parentName?: string;
}

export default function PatientDiagnoseisScreen() {
  const { accessToken, loggedInPatientAmka, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, 'Διαγνώσεις');

  const [activeCategory, setActiveCategory] = useState<Category>('adult');
  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Diagnosis>(webId, 'Διαγνώσεις') ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(cachedRecords);
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    // Προεπιλέγουμε την καρτέλα (Ενήλικες/Παιδικές) ανάλογα με την τρέχουσα ηλικία του ασθενή -
    // ο ίδιος μπορεί μετά να δει ελεύθερα και την άλλη καρτέλα.
    fetchPatientByAmka(loggedInPatientAmka).then(({ data }) => {
      if (data?.birth_date) {
        setActiveCategory(calculateAge(data.birth_date) >= 18 ? 'adult' : 'child');
      }
    }).catch(() => {});
  }, []);

  const loadDiagnoses = async (silent = false) => {
    try {
      if (!silent && diagnoses.length === 0) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί διαγνώσεις.
          files = [];
        }
      }

      const diagnosisFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Diagnosis>({
        urls: diagnosisFiles,
        parse: async (url) => {
          try {
            const content = await fetchFileContent(url, accessToken);
            const record = JSON.parse(content);
            // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
            if (!isCompleteRecord('Διαγνώσεις', record)) return null;
            return { url, retraction: parseRetraction(record), title: record.title, date: record.date, doctorName: record.doctorName, doctorAmka: record.doctorAmka, category: record.category, code: record.code, parentName: record.parentName } as Diagnosis;
          } catch {
            return null;
          }
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && diagnoses.length === 0 ? (records) => setDiagnoses(records) : undefined,
      });

      setDiagnoses(valid);
      setCachedRecords(webId, 'Διαγνώσεις', valid);
      ensureDoctorInfo(valid.map((d) => d.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setDiagnoses([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadDiagnoses);

  const displayDoctorName = (item: Diagnosis) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  // Η αναζήτηση γίνεται μέσα στην επιλεγμένη καρτέλα και όχι σε όλες τις διαγνώσεις: έτσι
  // και το όριο εμφάνισης του πεδίου κρίνεται από όσες βλέπει όντως ο χρήστης.
  const categoryDiagnoses = useMemo(
    () => diagnoses.filter((d) => d.category === activeCategory),
    [diagnoses, activeCategory],
  );

  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: foundDiagnoses } =
    useRecordSearch(categoryDiagnoses, (item) => [item.title, item.code, item.parentName]);

  const visibleDiagnoses = useMemo(
    () => [...foundDiagnoses].sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return newestFirst ? diff : -diff;
    }),
    [foundDiagnoses, newestFirst],
  );

  // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
  const openDetail = (item: { url: string }) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: 'Διαγνώσεις', webId } });
  };

  // Ομαδοποίηση ανά έτος, ώστε να υπάρχει σημείο αναφοράς καθώς κατεβαίνει η λίστα.
  const sections = useMemo(
    () => groupByYearRetractedLast(visibleDiagnoses, (item) => timeOf(item.date)),
    [visibleDiagnoses],
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Διαγνώσεις</Text>
      </View>

      {/* Μόνο ο τίτλος (historyHeader) μένει σταθερός στην κορυφή· κατηγορίες/sort/αναζήτηση
          μπαίνουν στο ListHeaderComponent, οπότε κυλούν μαζί με τη λίστα. */}
      <SectionList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        sections={sections}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <YearSectionHeader title={section.title} />}
        keyExtractor={(item) => item.url}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
        ListHeaderComponent={
          <>
            <View style={[doctorStyles.diagnosisCategoryRow, { marginTop: SPACING.groupGap }]}>
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

            <SortDropdown
              value={newestFirst}
              onChange={setNewestFirst}
              newestLabel="Νεότερες προς Παλαιότερες"
              oldestLabel="Παλαιότερες προς Νεότερες"
            />

            <RecordSearchBar
              label="Αναζήτηση διάγνωσης:"
              value={searchQuery}
              onChange={setSearchQuery}
              visible={searchVisible}
              containerStyle={{ width: '70%', alignSelf: 'center', marginTop: SPACING.groupGap, marginBottom: SPACING.groupGap }}
            />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <Text style={[styles.emptyText, { marginTop: 30 }]}>
              {searching ? 'Δεν βρέθηκε διάγνωση με αυτά τα στοιχεία.' : 'Δεν υπάρχουν διαγνώσεις ακόμα.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
            <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία: </Text>{formatDate(item.date)}
            </Text>
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
            </Text>
            <RetractedNote retraction={item.retraction} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
