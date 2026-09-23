import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, timeOf } from '../../../utils/podRecords';
import { groupByYearRetractedLast } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { useRecordSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { SortDropdown } from '../../../components/SortDropdown';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFilesOrEmpty, fetchFileContent, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { calculateAge, formatDate } from '../../../utils/age';
import { SPACING } from '../../../constants/designSystem';
import { useDoctorNames, formatDoctorLastNameOnly } from '../../../hooks/useDoctorNames';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { askText, showMessage } from '../../../utils/appMessage';
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
  // Κωδικός ICD-10. Λείπει από τις παλιές εγγραφές, που ήταν ελεύθερο κείμενο.
  code?: string;
  // Η κατηγορία-γονέας του κωδικού, ως συμφραζόμενο ("Κάτω γνάθος" -> κακοήθη νεοπλάσματα).
  parentName?: string;
}

export default function DoctorDiagnoseisScreen() {
  const { amka, firstName, lastName, webId, birthDate, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const patientName = `${firstName} ${lastName}`;
  const folderUrl = webId ? getCategoryFolderUrl(webId, 'Διαγνώσεις') : '';
  // Ο γιατρός με "Μόνο Ανάγνωση" πρόσβαση βλέπει το ιστορικό όπως ακριβώς ο ίδιος ο ασθενής -
  // χωρίς δυνατότητα προσθήκης/επεξεργασίας/διαγραφής.
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  const patientCategory: Category = calculateAge(birthDate) >= 18 ? 'adult' : 'child';
  const [activeCategory, setActiveCategory] = useState<Category>(patientCategory);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Diagnosis>(webId, 'Διαγνώσεις') ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateDiagnoses = (change: (prev: Diagnosis[]) => Diagnosis[]) => {
    setDiagnoses((prev) => {
      const next = change(prev);
      setCachedRecords(webId, 'Διαγνώσεις', next);
      return next;
    });
  };
  const [newestFirst, setNewestFirst] = useState(true);

  const loadDiagnoses = async (silent = false) => {
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && diagnoses.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);
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
        compare: (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && diagnoses.length === 0 ? (records) => setDiagnoses(records) : undefined,
      });

      setDiagnoses(valid);
      setCachedRecords(webId, 'Διαγνώσεις', valid);
      ensureDoctorInfo(valid.map((d) => d.doctorAmka));
    } catch (error: any) {
      // 403 από το Pod = ο ασθενής κατάργησε την πρόσβαση όσο ο γιατρός ήταν μέσα. Το αναλαμβάνει
      // ο φύλακας, που βγάζει το σωστό μήνυμα και τον επιστρέφει στην αρχική του.
      if (isPodAccessDenied(error)) {
        checkAccess();
        return;
      }
      showMessage(error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadDiagnoses);

  // Η αναζήτηση γίνεται μέσα στην επιλεγμένη καρτέλα και όχι σε όλες τις διαγνώσεις: έτσι
  // και το όριο εμφάνισης του πεδίου κρίνεται από όσες βλέπει όντως ο γιατρός.
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

  const canAddDiagnosis = activeCategory === patientCategory && !isReadOnly;

  const displayDoctorName = (item: Diagnosis) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorLastNameOnly(info) : item.doctorName;
  };

  const openForm = (item?: Diagnosis) => {
    router.push({
      pathname: ROUTES.DIAGNOSIS_FORM,
      params: {
        amka,
        webId,
        accessType,
        category: patientCategory,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editDate: item.date,
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractDiagnosis = async (item: Diagnosis) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const reason = await askText({
      message: 'Ανάκληση: η διάγνωση δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. καταχωρήθηκε σε λάθος ασθενή',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('doctor', loggedInDoctorAmka, '');
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateDiagnoses((prev) => prev.map((d) => (d.url === item.url ? { ...d, retraction } : d)));
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανάκλησης.');
    }
  };

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
        <Text style={doctorStyles.historyPatientName}>{patientName}</Text>
      </View>

      {/* Μόνο ο τίτλος (historyHeader) μένει σταθερός στην κορυφή· τα υπόλοιπα μπαίνουν στο
          ListHeaderComponent, οπότε κυλούν μαζί με τη λίστα. */}
      <SectionList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        sections={sections}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <YearSectionHeader title={section.title} />}
        keyExtractor={(item) => item.url}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
        ListHeaderComponent={
          <>
            <View style={[doctorStyles.diagnosisCategoryRow, { marginTop: SPACING.sectionGap }]}>
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

            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {canAddDiagnosis && (
                <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
                  <Text style={styles.addButtonText}>+ Προσθήκη Διάγνωσης</Text>
                </TouchableOpacity>
              )}

              <SortDropdown
                value={newestFirst}
                onChange={setNewestFirst}
                newestLabel="Νεότερες προς Παλαιότερες"
                oldestLabel="Παλαιότερες προς Νεότερες"
              />
            </View>

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
            <Text style={styles.emptyText}>
              {searching ? 'Δεν βρέθηκε διάγνωση με αυτά τα στοιχεία.' : 'Δεν υπάρχουν διαγνώσεις.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
            <View style={doctorStyles.diagnosisCardHeader}>
              <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
              {/* TODO: αφαίρεση fallback - προσωρινό ξέσκαρτισμα παλιών εγγραφών χωρίς doctorAmka */}
              <RecordCardActions
                visible={!isReadOnly && (item.doctorAmka === loggedInDoctorAmka || !item.doctorAmka) && !item.retraction}
                onEdit={() => openForm(item)}
                onRetract={() => handleRetractDiagnosis(item)}
              />
            </View>
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
