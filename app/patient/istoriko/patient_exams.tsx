import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { FilterScrollRow } from '../../../components/FilterScrollRow';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { EXAM_FILTERS as CATEGORIES } from '../../../constants/medicalOptions';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, createdAtFromUrl, compareNewestFirst, timeOf, createdDateFromUrl } from '../../../utils/podRecords';
import { groupByYear } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { saveRecordEdit } from '../../../services/recordRevisions';
import { useSearchField, normalizeForSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, saveFileContent, getCategoryFolderUrl, getOwnerWebId, uploadAttachment, downloadAttachment } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askText, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Εξετάσεις';

interface Exam {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
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


function PendingExamCard({ item, doctorDisplayName, uploading, canRetract, onUpload, onRetract, onOpen }: { item: Exam; doctorDisplayName: string; uploading: boolean; canRetract: boolean; onUpload: (item: Exam) => void; onRetract: (item: Exam) => void; onOpen: (item: Exam) => void }) {
  return (
    // Η κάρτα ανοίγει την αναλυτική προβολή. Τα κουμπιά μέσα της κρατούν το δικό τους πάτημα.
    <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <RecordCardActions visible={canRetract} onRetract={() => onRetract(item)} />
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

      {/* Σε ανακληθείσα παραπομπή δεν ανεβαίνει αποτέλεσμα: η εξέταση έχει αποσυρθεί. */}
      {!item.retraction && (
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
      )}

      <RetractedNote retraction={item.retraction} />
    </TouchableOpacity>
  );
}

function CompletedExamCard({ item, onOpen }: { item: Exam; onOpen: (item: Exam) => void }) {
  return (
    <TouchableOpacity
      style={[doctorStyles.diagnosisCard, { flexDirection: 'row', alignItems: 'center' }, item.retraction && retractedCardStyle]}
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
        <RetractedNote retraction={item.retraction} />
        </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
    </TouchableOpacity>
  );
}

export default function PatientExamsScreen() {
  const { accessToken, activePatientFolderUrl, loggedInPatientAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

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
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const loadExams = async (silent = false) => {
    try {
      if (!silent && exams.length === 0) setLoading(true);
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
              retraction: parseRetraction(record),
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

  // Ο ασθενής καταχωρεί στον ΔΙΚΟ ΤΟΥ φάκελο, οπότε δεν περνάμε ΑΜΚΑ ούτε τύπο πρόσβασης:
  // δεν υπάρχει καταχώρηση πρόσβασης να ελεγχθεί. Είναι η ίδια φόρμα που χρησιμοποιεί ο
  // γιατρός - αναγνωρίζει από τον ρόλο ότι γράφει ο ασθενής και υπογράφει "κος/κα" αντί "Δρ.".
  const openAddForm = () => {
    router.push({ pathname: ROUTES.EXAM_FORM, params: { webId } });
  };

  const displayDoctorName = (item: Exam) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const handleUploadResult = async (item: Exam) => {
    if (!accessToken) {
      showMessage("ΣΦΑΛΜΑ: Το Access Token λείπει!");
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

      // Το ανέβασμα ξαναγράφει ολόκληρη την εγγραφή του γιατρού, οπότε κρατάμε την
      // προηγούμενη μορφή της και υπογράφουμε ποιος την άλλαξε.
      const author = await resolveRecordAuthor('patient', '', loggedInPatientAmka);
      await saveRecordEdit(item.url, accessToken, record, author);

      updateExams((prev) => prev.map((e) => e.url === item.url ? { ...e, status: 'completed', completedDate, resultFile: asset.name } : e));
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία μεταφόρτωσης αρχείου.");
    } finally {
      setUploadingFor(null);
    }
  };

  const openDetail = (item: Exam) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή, και ο ασθενής ανακαλεί μόνο ό,τι
  // καταχώρησε ο ίδιος: η παραπομπή ή η συνταγή του γιατρού δεν είναι δική του να την
  // αποσύρει, αλλιώς ο φάκελος παύει να είναι αξιόπιστος για τον επόμενο γιατρό.
  const handleRetractExam = async (item: Exam) => {
    const reason = await askText({
      message: 'Ανάκληση: η εξέταση δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. την καταχώρησα δύο φορές',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('patient', '', loggedInPatientAmka);
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateExams((prev) => prev.map((e) => (e.url === item.url ? { ...e, retraction } : e)));
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανάκλησης.');
    }
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
    // Η αναζήτηση πιάνει και τον τύπο, ώστε πληκτρολογώντας π.χ. "αιματολογ" να βγαίνουν όλες
    // οι εξετάσεις αυτής της κατηγορίας - λειτουργεί μαζί με το επιλεγμένο φίλτρο, όχι αντί.
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

  // Ίδια λογική με την οθόνη του γιατρού: όσο υπάρχει αναζήτηση ανοίγουμε αυτόματα και τις
  // "Ολοκληρωμένες", αλλιώς ένα αποτέλεσμα εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
  // Πέντε εξετάσεις ανά σελίδα σε κάθε ενότητα, χωριστά η μία από την άλλη.


  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εξετάσεις</Text>
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddForm}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εξέτασης</Text>
        </TouchableOpacity>
      </View>

      <RecordSearchBar
        label="Αναζήτηση εξέτασης:"
        value={searchQuery}
        onChange={setSearchQuery}
        visible={searchVisible}
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
              <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
                {searchQuery.trim() ? 'Δεν βρέθηκε εκκρεμής εξέταση με αυτά τα στοιχεία.' : 'Δεν υπάρχουν εκκρεμείς εξετάσεις.'}
              </Text>
            ) : null
          )}
          renderItem={({ item, section }) => (
            section.kind === 'year' ? (
              <CompletedExamCard item={item} onOpen={openDetail} />
            ) : (
              <PendingExamCard
                item={item}
                doctorDisplayName={displayDoctorName(item)}
                uploading={uploadingFor === item.url}
                onUpload={handleUploadResult}
                canRetract={item.doctorAmka === loggedInPatientAmka && !item.retraction}
                onRetract={handleRetractExam}
                onOpen={openDetail}
              />
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
