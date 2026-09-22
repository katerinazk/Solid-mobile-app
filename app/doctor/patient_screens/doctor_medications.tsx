import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, compareNewestFirst, timeOf } from '../../../utils/podRecords';
import { groupByYear } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction, withRetractedLast } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { useSearchField, normalizeForSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { formatDuration, medicationEndDate } from '../../../utils/duration';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askText, showMessage } from '../../../utils/appMessage';
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
  // false = ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη" στη δική του οθόνη (εμφανίζεται ως
  // "εκκρεμές" εκεί). undefined = παλιά εγγραφή από πριν υπάρξει αυτή η έννοια -> θεωρείται
  // ήδη ενεργή, όχι εκκρεμής.
  started?: boolean;
  // Κωδικός ATC της δραστικής ουσίας. Λείπει από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

function MedicationCard({ item, doctorDisplayName, loggedInDoctorAmka, allowEdit, onEdit, onRetract, onOpen }: { item: Medication; doctorDisplayName: string; loggedInDoctorAmka: string; allowEdit: boolean; onEdit: (item: Medication) => void; onRetract: (item: Medication) => void; onOpen: (item: Medication) => void }) {
  return (
    // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους
    // πάτημα, οπότε δεν ανοίγουν κατά λάθος την προβολή.
    <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <RecordCardActions
          visible={allowEdit && item.doctorAmka === loggedInDoctorAmka && !item.retraction}
          onEdit={() => onEdit(item)}
          onRetract={() => onRetract(item)}
        />
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
        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>
        {item.startDate ? formatDate(item.startDate) : 'εκκρεμεί έναρξη από τον ασθενή'}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{doctorDisplayName}
      </Text>
    </TouchableOpacity>
  );
}

export default function DoctorMedicationsScreen() {
  const { amka, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

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

  const loadMedications = async (silent = false) => {
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && medications.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

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
    loadMedications();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadMedications);

  const displayDoctorName = (item: Medication) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const openDetail = (item: Medication) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId } });
  };

  const openForm = (item?: Medication) => {
    router.push({
      pathname: ROUTES.MEDICATION_FORM,
      params: {
        amka,
        webId,
        accessType,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editDosage: item.dosage,
          editRoute: item.route,
          editLinks: item.links?.length ? JSON.stringify(item.links) : '',
          editDurationDays: String(item.durationDays),
          editDurationMonths: item.durationMonths ? String(item.durationMonths) : '',
          editStartDate: item.startDate,
          // Οι παλιές εγγραφές δεν έχουν started - το αφήνουμε κενό ώστε να μείνει undefined.
          editStarted: item.started === undefined ? '' : String(item.started),
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractMedication = async (item: Medication) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const reason = await askText({
      message: 'Ανάκληση: η συνταγή δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. συνταγογραφήθηκε σε λάθος ασθενή',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('doctor', loggedInDoctorAmka, '');
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

    // Ίδια σειρά με την οθόνη του ασθενή: τα εκκρεμή πρώτα στην τρέχουσα αγωγή, και οι
    // προηγούμενες με την πιο πρόσφατη έναρξη πρώτη.
    active.sort((a, b) => Number(b.started === false) - Number(a.started === false));
    previous.sort((a, b) => compareNewestFirst(timeOf(a.startDate), timeOf(b.startDate)));

    // Οι ανακληθείσες μένουν στην ενεργή αγωγή - δεν έγιναν προηγούμενη - αλλά τελευταίες.
    return { activeMedications: withRetractedLast(active), previousMedications: previous };
  }, [medications, searchQuery]);

  // Ομαδοποίηση ανά έτος μόνο στην ενότητα που μαζεύει εγγραφές με τα χρόνια.
  const previousSections = useMemo(
    () => groupByYear(previousMedications, (item) => timeOf(item.startDate)),
    [previousMedications],
  );

  const previousSectionOpen = showPrevious || (searchQuery.trim().length > 0 && previousMedications.length > 0);

  // Όλα όσα δείχνει η οθόνη ως ενότητες μιας λίστας. Χρειάζεται λίστα και όχι απλή κυλιόμενη
  // περιοχή, ώστε ο τίτλος κάθε ενότητας να μένει κολλημένος στην κορυφή όσο κυλάει το
  // περιεχόμενό της.
  const sections = useMemo(() => {
    const result: { kind: 'active' | 'toggle' | 'year'; title: string; data: Medication[] }[] = [
      { kind: 'active', title: 'Ενεργή Αγωγή', data: activeMedications },
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

  // Όταν ο γιατρός ψάχνει κάτι, ανοίγουμε αυτόματα και την "Προηγούμενη Αγωγή" - αλλιώς ένα
  // αποτέλεσμα που βρίσκεται εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
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

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {!isReadOnly && (
          <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
            <Text style={styles.addButtonText}>+ Προσθήκη Φαρμάκου</Text>
          </TouchableOpacity>
        )}

        <RecordSearchBar
          label="Αναζήτηση φαρμάκου:"
          value={searchQuery}
          onChange={setSearchQuery}
          visible={searchVisible}
          containerStyle={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.sectionGap }}
        />
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
                <TouchableOpacity style={localStyles.stickyHeader} onPress={() => setShowPrevious((prev) => !prev)}>
                  <Ionicons name={previousSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
                </TouchableOpacity>
              );
            }

            return (
              <View style={localStyles.stickyHeader}>
                <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Ενεργή Αγωγή</Text>
              </View>
            );
          }}
          renderSectionFooter={({ section }) => (
            section.kind === 'active' && activeMedications.length === 0 ? (
              <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ενεργές αγωγές.</Text>
            ) : null
          )}
          renderItem={({ item, section }) => (
            // Το allowEdit ισχύει μόνο στην ενεργή αγωγή: σε φάρμακο που τελείωσε δεν γίνεται
            // ούτε διόρθωση ούτε ανάκληση, η αγωγή έχει ήδη χορηγηθεί και ανήκει στο ιστορικό.
            <MedicationCard
              item={item}
              doctorDisplayName={displayDoctorName(item)}
              loggedInDoctorAmka={loggedInDoctorAmka}
              allowEdit={section.kind === 'active' && !isReadOnly}
              onEdit={openForm}
              onRetract={handleRetractMedication}
              onOpen={openDetail}
            />
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
});
