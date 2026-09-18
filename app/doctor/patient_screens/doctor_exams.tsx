import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { EXAM_FILTERS as CATEGORIES } from '../../../constants/medicalOptions';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, createdAtFromUrl, compareNewestFirst, timeOf, createdDateFromUrl } from '../../../utils/podRecords';
import { groupByYear } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { useSearchField, normalizeForSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { FilterScrollRow } from '../../../components/FilterScrollRow';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { listFolderFilesOrEmpty, fetchFileContent, deleteFile, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askConfirm, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

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
  // Κωδικός LOINC. Λείπει από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}


function PendingExamCard({ item, doctorDisplayName, loggedInDoctorAmka, isReadOnly, onEdit, onDelete, onOpen }: { item: Exam; doctorDisplayName: string; loggedInDoctorAmka: string; isReadOnly: boolean; onEdit: (item: Exam) => void; onDelete: (item: Exam) => void; onOpen: (item: Exam) => void }) {
  return (
    // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
    <TouchableOpacity style={doctorStyles.diagnosisCard} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        {!isReadOnly && item.doctorAmka === loggedInDoctorAmka && (
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
      {!!item.createdDate && (
        <Text style={doctorStyles.diagnosisCardDetail}>
          <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Καταχώρησης: </Text>{formatDate(item.createdDate)}
        </Text>
      )}
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>
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

export default function DoctorExamsScreen() {
  const { amka, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  const [selectedCategory, setSelectedCategory] = useState('Όλες');
  const [showCompleted, setShowCompleted] = useState(true);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Exam>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [exams, setExams] = useState<Exam[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateExams = (change: (prev: Exam[]) => Exam[]) => {
    setExams((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };

  const loadExams = async (silent = false) => {
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && exams.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

      const examFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Exam>({
        urls: examFiles,
        parse: async (url) => {
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
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && exams.length === 0 ? (records) => setExams(records) : undefined,
      });

      setExams(valid);
      setCachedRecords(webId, CATEGORY, valid);
      ensureDoctorInfo(valid.map((e) => e.doctorAmka));
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
    loadExams();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadExams);

  const displayDoctorName = (item: Exam) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  // Η αναζήτηση εμφανίζεται μόνο όταν η λίστα ξεπερνά το όριο εγγραφών - το ίδιο όριο
  // με τις υπόλοιπες οθόνες ιστορικού.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible } = useSearchField(exams.length);

  const { pendingExams, completedExams } = useMemo(() => {
    const query = normalizeForSearch(searchQuery);
    const matchesCategory = (e: Exam) => {
      if (selectedCategory === 'Όλες') return true;
      return e.type === selectedCategory;
    };
    const matchesSearch = (e: Exam) => {
      if (!query) return true;
      return normalizeForSearch(e.title || '').includes(query) || normalizeForSearch(e.type || '').includes(query);
    };
    const filtered = exams.filter((e) => matchesCategory(e) && matchesSearch(e));
    // Πιο πρόσφατες πρώτα σε κάθε ενότητα: οι εκκρεμείς κατά ημερομηνία καταχώρησης, οι
    // ολοκληρωμένες κατά ημερομηνία αποτελέσματος με εφεδρεία την καταχώρηση.
    return {
      pendingExams: filtered
        .filter((e) => e.status === 'pending')
        .sort((a, b) => compareNewestFirst(timeOf(a.createdDate), timeOf(b.createdDate))),
      completedExams: filtered
        .filter((e) => e.status === 'completed')
        .sort((a, b) => compareNewestFirst(
          timeOf(a.completedDate || a.createdDate),
          timeOf(b.completedDate || b.createdDate),
        )),
    };
  }, [exams, selectedCategory, searchQuery]);

  // Ομαδοποίηση ανά έτος μόνο στην ενότητα που μαζεύει εγγραφές με τα χρόνια.
  const completedSections = useMemo(
    () => groupByYear(completedExams, (item) => timeOf(item.completedDate || item.createdDate)),
    [completedExams],
  );

  const completedSectionOpen = showCompleted || (searchQuery.trim().length > 0 && completedExams.length > 0);

  // Όλα όσα δείχνει η οθόνη ως ενότητες μιας λίστας. Χρειάζεται λίστα και όχι απλή κυλιόμενη
  // περιοχή, ώστε ο τίτλος κάθε ενότητας να μένει κολλημένος στην κορυφή όσο κυλάει το
  // περιεχόμενό της. Ο τύπος κάθε ενότητας λέει τι ζωγραφίζεται ως κεφαλίδα και ως κάρτα.
  const sections = useMemo(() => {
    const result: { kind: 'pending' | 'toggle' | 'year'; title: string; data: Exam[] }[] = [
      { kind: 'pending', title: 'Εκκρεμείς', data: pendingExams },
    ];

    // Χωρίς ολοκληρωμένες δεν δείχνουμε ούτε τον τίτλο: μια κεφαλίδα που ανοίγει σε άδειο
    // περιεχόμενο δεν προσφέρει τίποτα στον χρήστη.
    if (completedExams.length > 0) {
      result.push({ kind: 'toggle', title: 'Ολοκληρωμένες', data: [] });
      if (completedSectionOpen) {
        for (const group of completedSections) {
          result.push({ kind: 'year', title: group.title, data: group.data });
        }
      }
    }

    return result;
  }, [pendingExams, completedExams, completedSections, completedSectionOpen]);

  // Όταν ο γιατρός ψάχνει κάτι, ανοίγουμε αυτόματα και τις "Ολοκληρωμένες" - αλλιώς ένα
  // αποτέλεσμα που βρίσκεται εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
  // Πέντε εξετάσεις ανά σελίδα σε κάθε ενότητα, χωριστά η μία από την άλλη.


  const openDetail = (item: Exam) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
  };

  const openForm = (item?: Exam) => {
    router.push({
      pathname: ROUTES.EXAM_FORM,
      params: {
        amka,
        webId,
        accessType,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editType: item.type,
          editStatus: item.status,
          editLinks: item.links?.length ? JSON.stringify(item.links) : '',
          editCompletedDate: item.completedDate,
          editResultFile: item.resultFile,
          editCreatedDate: item.createdDate,
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  const handleDeleteExam = async (item: Exam) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const confirmed = await askConfirm({
      message: "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εξέταση;",
      confirmText: "Διαγραφή",
      cancelText: "Ακύρωση",
    });
    if (!confirmed) return;

    try {
      await deleteFile(item.url, accessToken);
      updateExams((prev) => prev.filter((e) => e.url !== item.url));
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία διαγραφής.");
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

      <RecordSearchBar
        label="Αναζήτηση εξέτασης:"
        value={searchQuery}
        onChange={setSearchQuery}
        visible={searchVisible}
        containerStyle={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.groupGap }}
      />

      <FilterScrollRow
        contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, alignItems: 'center' }}
        style={localStyles.categoryBar}
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
      </FilterScrollRow>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {!isReadOnly && (
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εξέτασης</Text>
        </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <SectionList
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          sections={sections}
          keyExtractor={(item) => item.url}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => {
            if (section.kind === 'year') return <YearSectionHeader title={section.title} />;

            if (section.kind === 'toggle') {
              return (
                <TouchableOpacity
                  style={localStyles.stickyHeader}
                  onPress={() => setShowCompleted((prev) => !prev)}
                >
                  <Ionicons name={completedSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Ολοκληρωμένες</Text>
                </TouchableOpacity>
              );
            }

            return (
              <View style={localStyles.stickyHeader}>
                <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Εκκρεμείς</Text>
              </View>
            );
          }}
          renderSectionFooter={({ section }) => (
            section.kind === 'pending' && pendingExams.length === 0 ? (
              <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν εκκρεμείς εξετάσεις.</Text>
            ) : null
          )}
          renderItem={({ item, section }) => (
            section.kind === 'year' ? (
              <CompletedExamCard item={item} onOpen={openDetail} />
            ) : (
              <PendingExamCard item={item} doctorDisplayName={displayDoctorName(item)} loggedInDoctorAmka={loggedInDoctorAmka} isReadOnly={isReadOnly} onEdit={openForm} onDelete={handleDeleteExam} onOpen={openDetail} />
            )
          )}
        />
      )}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Οι κολλημένες κεφαλίδες ΠΡΕΠΕΙ να έχουν αδιαφανές φόντο, αλλιώς οι κάρτες φαίνονται
  // να περνούν από πίσω τους καθώς κυλάει η λίστα.
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.light,
    paddingHorizontal: SPACING.sideMargin,
    paddingVertical: SPACING.groupGap,
  },
  // Σταθερό ύψος και χωρίς συρρίκνωση. Χωρίς αυτό, η λωρίδα των φίλτρων πιέζεται όταν
  // στενεύει ο κατακόρυφος χώρος και τα κουμπιά κόβονται από μια αόρατη γραμμή.
  categoryBar: {
    flexGrow: 0,
    flexShrink: 0,
    height: TOUCH.buttonHeight + SPACING.groupGap,
    marginBottom: SPACING.groupGap,
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
