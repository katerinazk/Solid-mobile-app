import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl, SectionList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, timeOf } from '../../../utils/podRecords';
import { groupByYear } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction, withRetractedLast } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord, saveRecordCompletion } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { useSearchField, normalizeForSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { SortDropdown } from '../../../components/SortDropdown';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, saveFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { formatDuration, medicationEndDate } from '../../../utils/duration';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askConfirm, askText, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Φάρμακα';

interface Medication {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
  title: string;
  dosage: string;
  // Τρόπος χορήγησης (χάπι, ενέσιμο, ...). Λείπει από τις εγγραφές πριν υπάρξει το πεδίο.
  route?: string;
  startDate: string;
  // Η εγγραφή ιστορικού στην οποία οφείλεται η καταχώρηση. Προαιρετική.
  links?: LinkedRecord[];
  durationDays: number;
  // Προαιρετικοί, δίπλα στις μέρες. Λείπουν από τις εγγραφές πριν υπάρξει το πεδίο.
  durationMonths?: number;
  doctorName: string;
  doctorAmka: string;
  // false = ο γιατρός μόλις το καταχώρησε και ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη".
  // undefined = παλιά εγγραφή από πριν υπάρξει αυτή η έννοια -> θεωρείται ήδη ενεργή.
  started?: boolean;
  // Κωδικός του διεθνούς προτύπου (ICD-10 / ATC / LOINC) και η κατηγορία στην οποία ανήκει,
  // όπως τα κατέγραψε ο γιατρός. Λείπουν από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

// Ένα φάρμακο είναι "εκκρεμές" μόνο όσο ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη" - μόλις το
// κάνει, περνάει αμέσως στην κανονική ενεργή αγωγή, ό,τι ημερομηνία κι αν έχει.
function isPending(item: Medication): boolean {
  return item.started === false;
}

// Η κάρτα φαρμάκου που έχει ήδη ξεκινήσει, ίδια και για την τρέχουσα και για την προηγούμενη
// αγωγή: η μόνη διαφορά των δύο ενοτήτων είναι αν η αγωγή τελείωσε, όχι το τι δείχνει η κάρτα.
function MedicationCard({ item, doctorDisplayName, canRetract, onOpen, onRetract }: {
  item: Medication;
  doctorDisplayName: string;
  canRetract: boolean;
  onOpen: (item: Medication) => void;
  onRetract: (item: Medication) => void;
}) {
  return (
    <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <RecordCardActions visible={canRetract} onRetract={() => onRetract(item)} />
      </View>
      {!!item.route && (
        <Text style={doctorStyles.diagnosisCardDetail}>
          <Text style={doctorStyles.diagnosisCardLabel}>Τρόπος Χορήγησης: </Text>{item.route}
        </Text>
      )}
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>
      <RetractedNote retraction={item.retraction} />
    </TouchableOpacity>
  );
}

// Το φάρμακο που συνταγογραφήθηκε αλλά δεν έχει πατηθεί ακόμα "Έναρξη". Δεν έχει ημερομηνία
// έναρξης να δείξει, και κρατά τα δύο κουμπιά ενέργειας.
function PendingMedicationCard({ item, doctorDisplayName, canRetract, onOpen, onStart, onRetract }: {
  item: Medication;
  doctorDisplayName: string;
  onOpen: (item: Medication) => void;
  onStart: (item: Medication) => void;
  canRetract: boolean;
  onRetract: (item: Medication) => void;
}) {
  return (
    <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <Text style={{ color: COLORS.danger, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText }}>ΕΚΚΡΕΜΕΙ</Text>
      </View>
      {!!item.route && (
        <Text style={doctorStyles.diagnosisCardDetail}>
          <Text style={doctorStyles.diagnosisCardLabel}>Τρόπος Χορήγησης: </Text>{item.route}
        </Text>
      )}
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
      </Text>

      {/* Ανακληθείσα συνταγή δεν ξεκινά: η αγωγή έχει αποσυρθεί από όποιον την έγραψε. */}
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {!item.retraction && (
          <TouchableOpacity
            style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginRight: 8, marginBottom: 0 }]}
            onPress={() => onStart(item)}
          >
            <Text style={doctorStyles.diagnosisSortButtonText}>Έναρξη</Text>
          </TouchableOpacity>
        )}
        {canRetract && (
          <TouchableOpacity
            style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}
            onPress={() => onRetract(item)}
          >
            <Text style={doctorStyles.diagnosisSortButtonText}>Ανάκληση</Text>
          </TouchableOpacity>
        )}
      </View>
      <RetractedNote retraction={item.retraction} />
    </TouchableOpacity>
  );
}

export default function PatientMedicationsScreen() {
  const { accessToken, activePatientFolderUrl, loggedInPatientAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Medication>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [medications, setMedications] = useState<Medication[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateMedications = (change: (prev: Medication[]) => Medication[]) => {
    setMedications((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };
  const [showPrevious, setShowPrevious] = useState(true);
  // Η αναζήτηση εμφανίζεται μόνο όταν η λίστα ξεπερνά το όριο εγγραφών - το ίδιο όριο
  // με τις υπόλοιπες οθόνες ιστορικού.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible } = useSearchField(medications.length);
  const [previousNewestFirst, setPreviousNewestFirst] = useState(true);

  const loadMedications = async (silent = false) => {
    try {
      if (!silent && medications.length === 0) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί φάρμακα.
          files = [];
        }
      }

      const medicationFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Medication>({
        urls: medicationFiles,
        parse: async (url) => {
          try {
            const content = await fetchFileContent(url, accessToken);
            const record = JSON.parse(content);
            // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
            if (!isCompleteRecord('Φάρμακα', record)) return null;
            return {
              url,
              retraction: parseRetraction(record),
              title: record.title,
              code: record.code,
              parentName: record.parentName,
              dosage: record.dosage,
              route: record.route,
              startDate: record.startDate,
              links: readLinks(record),
              durationDays: record.durationDays,
              durationMonths: record.durationMonths,
              doctorName: record.doctorName,
              doctorAmka: record.doctorAmka,
              started: record.started,
            } as Medication;
          } catch {
            return null;
          }
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && medications.length === 0 ? (records) => setMedications(records) : undefined,
      });

      setMedications(valid);
      setCachedRecords(webId, CATEGORY, valid);
      ensureDoctorInfo(valid.map((m) => m.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setMedications([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadMedications);

  // Ο ασθενής καταχωρεί στον ΔΙΚΟ ΤΟΥ φάκελο, οπότε δεν περνάμε ΑΜΚΑ ούτε τύπο πρόσβασης:
  // δεν υπάρχει καταχώρηση πρόσβασης να ελεγχθεί. Είναι η ίδια φόρμα που χρησιμοποιεί ο
  // γιατρός - αναγνωρίζει από τον ρόλο ότι γράφει ο ασθενής και υπογράφει "κος/κα" αντί "Δρ.".
  const openAddForm = () => {
    router.push({ pathname: ROUTES.MEDICATION_FORM, params: { webId } });
  };

  const displayDoctorName = (item: Medication) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const openDetail = (item: Medication) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
  };

  const handleStartMedication = async (item: Medication) => {
    // Η έναρξη γράφει τη σημερινή ημερομηνία μέσα στην εγγραφή και βγάζει το φάρμακο από
    // τα εκκρεμή. Δεν ξεγίνεται με ένα πάτημα, οπότε ζητάμε επιβεβαίωση.
    const confirmed = await askConfirm({
      message: `Να ξεκινήσει η αγωγή "${item.title}" από σήμερα;`,
      confirmText: 'Ναι',
      cancelText: 'Όχι',
    });
    if (!confirmed) return;

    if (!accessToken) {
      showMessage("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const record = {
        title: item.title,
        // Το "Έναρξη" ξαναγράφει όλο το αρχείο - χωρίς αυτά θα χανόταν ο κωδικός ATC.
        code: item.code,
        parentName: item.parentName,
        route: item.route,
        dosage: item.dosage,
        startDate,
        durationDays: item.durationDays,
        durationMonths: item.durationMonths,
        links: item.links,
        doctorName: item.doctorName,
        doctorAmka: item.doctorAmka,
        started: true,
      };

      // Η έναρξη ΔΕΝ είναι διόρθωση: ο ασθενής δηλώνει ότι ξεκίνησε την αγωγή που του
      // έγραψαν, δεν αλλάζει τη συνταγή. Η αποθήκευση κρατά μόνο ό,τι δεν ξέρει η οθόνη.
      await saveRecordCompletion(item.url, accessToken, record);

      updateMedications((prev) => prev.map((m) => m.url === item.url ? { ...m, startDate, started: true } : m));
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία σύνδεσης με το Pod.");
    }
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή, και ο ασθενής ανακαλεί μόνο ό,τι
  // καταχώρησε ο ίδιος: η παραπομπή ή η συνταγή του γιατρού δεν είναι δική του να την
  // αποσύρει, αλλιώς ο φάκελος παύει να είναι αξιόπιστος για τον επόμενο γιατρό.
  const handleRetractMedication = async (item: Medication) => {
    const reason = await askText({
      message: 'Ανάκληση: η αγωγή δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. την καταχώρησα δύο φορές',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('patient', '', loggedInPatientAmka);
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateMedications((prev) => prev.map((m) => (m.url === item.url ? { ...m, retraction } : m)));
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανάκλησης.');
    }
  };

  const { activeMedications, previousMedications } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = normalizeForSearch(searchQuery);
    const active: Medication[] = [];
    const previous: Medication[] = [];

    for (const med of medications) {
      // Η αναζήτηση γίνεται στο όνομα του φαρμάκου, πριν τον διαχωρισμό σε ενεργά/προηγούμενα,
      // ώστε το φιλτράρισμα να ισχύει και στις δύο ενότητες.
      if (query && !normalizeForSearch(med.title || '').includes(query)) continue;

      // Το φάρμακο που δεν έχει ξεκινήσει ακόμα είναι τρέχουσα συνταγή, όχι περασμένη αγωγή.
      // Χωρίς αυτό θα έπεφτε στις προηγούμενες, αφού δεν έχει καθόλου ημερομηνία έναρξης.
      if (med.started === false) {
        active.push(med);
        continue;
      }

      const endDate = medicationEndDate(med.startDate, med.durationDays, med.durationMonths);
      if (endDate >= today) {
        active.push(med);
      } else {
        previous.push(med);
      }
    }

    // Τα εκκρεμή φάρμακα (δεν έχει πατηθεί ακόμα "Έναρξη") εμφανίζονται πάντα πρώτα.
    active.sort((a, b) => Number(isPending(b)) - Number(isPending(a)));

    previous.sort((a, b) => {
      const diff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      return previousNewestFirst ? diff : -diff;
    });

    // Οι ανακληθείσες μένουν στην ενεργή αγωγή - δεν έγιναν προηγούμενη - αλλά τελευταίες.
    return { activeMedications: withRetractedLast(active), previousMedications: previous };
  }, [medications, previousNewestFirst, searchQuery]);

  // Ομαδοποίηση ανά έτος μόνο στην ενότητα που μαζεύει εγγραφές με τα χρόνια.
  const previousSections = useMemo(
    () => groupByYear(previousMedications, (item) => timeOf(item.startDate)),
    [previousMedications],
  );

  const previousSectionOpen = showPrevious || (searchQuery.trim().length > 0 && previousMedications.length > 0);

  // Όλα όσα δείχνει η οθόνη ως ενότητες μιας λίστας, ώστε ο τίτλος κάθε ενότητας να μένει
  // κολλημένος στην κορυφή όσο κυλάει το περιεχόμενό της.
  const sections = useMemo(() => {
    const result: { kind: 'active' | 'toggle' | 'year'; title: string; data: Medication[] }[] = [
      { kind: 'active', title: 'Ενεργής Αγωγή', data: activeMedications },
    ];

    // Χωρίς προηγούμενη αγωγή δεν δείχνουμε ούτε τον τίτλο.
    if (previousMedications.length > 0) {
      result.push({ kind: 'toggle', title: 'Προηγούμενη Αγωγή', data: [] });
      if (previousSectionOpen) {
        for (const group of previousSections) {
          result.push({ kind: 'year', title: group.title, data: group.data });
        }
      }
    }

    return result;
  }, [activeMedications, previousMedications, previousSections, previousSectionOpen]);

  // Όσο υπάρχει αναζήτηση ανοίγουμε μόνοι μας την "Προηγούμενη Αγωγή", αλλιώς τα αποτελέσματα
  // που βρίσκονται εκεί θα έμεναν κρυμμένα μέσα στην κλειστή ενότητα.
  // Πέντε φάρμακα ανά σελίδα σε κάθε ενότητα. Οι δύο ενότητες σελιδοποιούνται χωριστά,
  // ώστε να μη μετακινεί η μία τα περιεχόμενα της άλλης.


  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Φάρμακα</Text>
      </View>

      {/* Μόνο ο τίτλος (historyHeader) μένει σταθερός στην κορυφή· το κουμπί προσθήκης και η
          αναζήτηση μπαίνουν στο ListHeaderComponent, οπότε κυλούν μαζί με τη λίστα. */}
      <SectionList
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        sections={sections}
        keyExtractor={(item) => item.url}
        stickySectionHeadersEnabled
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddForm}>
                <Text style={styles.addButtonText}>+ Προσθήκη Φαρμάκου</Text>
              </TouchableOpacity>
            </View>

            <RecordSearchBar
              label="Αναζήτηση φαρμάκου:"
              value={searchQuery}
              onChange={setSearchQuery}
              visible={searchVisible}
            />

            {loading && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />}
          </>
        }
        renderSectionHeader={({ section }) => {
            if (section.kind === 'year') return <YearSectionHeader title={section.title} />;

            if (section.kind === 'toggle') {
              return (
                <TouchableOpacity style={localStyles.stickyHeader} onPress={() => setShowPrevious((prev) => !prev)}>
                  <Ionicons name={previousSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
                </TouchableOpacity>
              );
            }

            return (
              <View style={localStyles.stickyHeader}>
                <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Ενεργής Αγωγή</Text>
              </View>
            );
          }}
          renderSectionFooter={({ section }) => {
            if (section.kind === 'active' && !loading && activeMedications.length === 0) {
              return (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
                  {searchQuery.trim() ? 'Δεν βρέθηκε φάρμακο με αυτό το όνομα.' : 'Δεν υπάρχουν ενεργές αγωγές.'}
                </Text>
              );
            }

            // Η ταξινόμηση αφορά ΟΛΗ την προηγούμενη αγωγή, γι' αυτό κάθεται κάτω από τον
            // τίτλο της ενότητας και όχι μέσα σε κάποια χρονιά.
            if (section.kind === 'toggle' && previousSectionOpen) {
              return (
                <SortDropdown
                  value={previousNewestFirst}
                  onChange={setPreviousNewestFirst}
                  newestLabel="Νεότερα προς Παλαιότερα"
                  oldestLabel="Παλαιότερα προς Νεότερα"
                />
              );
            }

            return null;
          }}
          renderItem={({ item, section }) => (
            section.kind === 'active' && isPending(item) ? (
              <PendingMedicationCard
                item={item}
                doctorDisplayName={displayDoctorName(item)}
                onOpen={openDetail}
                canRetract={item.doctorAmka === loggedInPatientAmka && !item.retraction}
                onStart={handleStartMedication}
                onRetract={handleRetractMedication}
              />
            ) : (
              <MedicationCard
                item={item}
                doctorDisplayName={displayDoctorName(item)}
                canRetract={item.doctorAmka === loggedInPatientAmka && !item.retraction}
                onOpen={openDetail}
                onRetract={handleRetractMedication}
              />
            )
          )}
        />
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
});
