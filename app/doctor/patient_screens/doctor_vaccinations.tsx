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
import { isCompleteRecord, timeOf } from '../../../utils/podRecords';
import { groupByYearRetractedLast } from '../../../utils/groupByYear';
import { groupDoses } from '../../../utils/groupDoses';
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
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, getCategoryFolderUrl, isPodAccessDenied, isPodTokenExpired } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askText, showMessage } from '../../../utils/appMessage';
import { friendlyErrorMessage } from '../../../utils/networkError';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Εμβολιασμοί';

interface Vaccination {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
  title: string;
  doctorName: string;
  doctorAmka: string;
  batchNumber: string;
  doseNumber: string;
  administeredDate: string;
  // Κωδικός ATC (J07). Λείπει από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

export default function DoctorVaccinationsScreen() {
  const { amka, firstName, lastName, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const patientName = `${firstName} ${lastName}`;
  const { accessToken, loggedInDoctorAmka, logout } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  // Ο γιατρός με "Μόνο Ανάγνωση" πρόσβαση βλέπει το ιστορικό όπως ακριβώς ο ίδιος ο ασθενής -
  // χωρίς δυνατότητα προσθήκης/επεξεργασίας/διαγραφής.
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Vaccination>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateVaccinations = (change: (prev: Vaccination[]) => Vaccination[]) => {
    setVaccinations((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };
  const [newestFirst, setNewestFirst] = useState(true);
  // Κλειδιά (κωδικός εμβολίου) των ομάδων δόσεων που είναι ανοιχτές αυτή τη στιγμή.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const loadVaccinations = async (silent = false) => {
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && vaccinations.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

      const vaccinationFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Vaccination>({
        urls: vaccinationFiles,
        parse: async (url) => {
          try {
            const content = await fetchFileContent(url, accessToken);
            const record = JSON.parse(content);
            // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
            if (!isCompleteRecord('Εμβολιασμοί', record)) return null;
            return {
              url,
              retraction: parseRetraction(record),
              title: record.title,
              code: record.code,
              parentName: record.parentName,
              doctorName: record.doctorName,
              doctorAmka: record.doctorAmka,
              batchNumber: record.batchNumber,
              doseNumber: record.doseNumber,
              administeredDate: record.administeredDate,
            } as Vaccination;
          } catch {
            return null;
          }
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && vaccinations.length === 0 ? (records) => setVaccinations(records) : undefined,
      });

      setVaccinations(valid);
      setCachedRecords(webId, CATEGORY, valid);
      ensureDoctorInfo(valid.map((v) => v.doctorAmka));
    } catch (error: any) {
      // 403 από το Pod = ο ασθενής κατάργησε την πρόσβαση όσο ο γιατρός ήταν μέσα. Το αναλαμβάνει
      // ο φύλακας, που βγάζει το σωστό μήνυμα και τον επιστρέφει στην αρχική του.
      if (isPodAccessDenied(error)) {
        checkAccess();
        return;
      }
      // 401 από το Pod = έληξε το access token (όχι κατάργηση πρόσβασης) - η ανανέωση στο
      // AuthContext προλαβαίνει το 99% των περιπτώσεων, αυτό είναι μόνο για την εξαίρεση.
      if (isPodTokenExpired(error)) {
        showMessage(error.message);
        logout();
        return;
      }
      showMessage(friendlyErrorMessage(error, "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει."));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadVaccinations();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadVaccinations);

  const displayDoctorName = (item: Vaccination) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  // Η αναζήτηση πιάνει και τον αριθμό παρτίδας, που είναι ό,τι ζητείται σε ανάκληση παρτίδας.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: foundVaccinations } =
    useRecordSearch(vaccinations, (item) => [item.title, item.code, item.parentName, item.batchNumber]);

  // Ομαδοποίηση ανά εμβόλιο (κοινός κωδικός): η πιο πρόσφατη δόση είναι η κάρτα, οι
  // υπόλοιπες κρύβονται μέχρι να ανοίξει. Μετά ταξινομούμε τις ΟΜΑΔΕΣ κατά την πιο πρόσφατη
  // δόση τους, ώστε το "↕" να δουλεύει το ίδιο όπως πριν, απλώς σε επίπεδο ομάδας.
  const doseGroups = useMemo(() => groupDoses(foundVaccinations), [foundVaccinations]);

  const sortedGroups = useMemo(() => {
    return [...doseGroups].sort((a, b) => {
      const diff = new Date(b.latest.administeredDate).getTime() - new Date(a.latest.administeredDate).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [doseGroups, newestFirst]);

  const openForm = (item?: Vaccination) => {
    router.push({
      pathname: ROUTES.VACCINATION_FORM,
      params: {
        amka,
        firstName,
        lastName,
        webId,
        accessType,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editBatchNumber: item.batchNumber,
          editDoseNumber: item.doseNumber,
          editAdministeredDate: item.administeredDate,
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractVaccination = async (item: Vaccination) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const reason = await askText({
      message: 'Ανάκληση: ο εμβολιασμός δεν διαγράφεται, σημαίνεται ως αποσυρμένος. Για ποιον λόγο;',
      placeholder: 'π.χ. καταχωρήθηκε σε λάθος ασθενή',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('doctor', loggedInDoctorAmka, '');
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateVaccinations((prev) => prev.map((v) => (v.url === item.url ? { ...v, retraction } : v)));
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, 'Αποτυχία ανάκλησης.'));
    }
  };

  // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
  const openDetail = (item: { url: string }) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: 'Εμβολιασμοί', webId, amka, firstName, lastName } });
  };

  // Ομαδοποίηση ανά έτος, ώστε να υπάρχει σημείο αναφοράς καθώς κατεβαίνει η λίστα - τώρα σε
  // επίπεδο ομάδας εμβολίου, με βάση την πιο πρόσφατη δόση της.
  const sections = useMemo(
    () => groupByYearRetractedLast(sortedGroups, (group) => timeOf(group.latest.administeredDate)),
    [sortedGroups],
  );

  // Η κάρτα μιας δόσης, ίδια είτε είναι η πιο πρόσφατη είτε μία από τις κρυμμένες παλαιότερες -
  // η μόνη διαφορά είναι το "extra" περιεχόμενο (το κουμπί εμφάνισης παλαιότερων) που παίρνει
  // μόνο η πιο πρόσφατη.
  const renderVaccinationCard = (item: Vaccination, extra?: React.ReactNode) => (
    <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        <RecordCardActions
          visible={!isReadOnly && (item.doctorAmka === loggedInDoctorAmka) && !item.retraction}
          onEdit={() => openForm(item)}
          onRetract={() => handleRetractVaccination(item)}
        />
      </View>

      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Παρτίδας: </Text>{item.batchNumber}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Δόσης: </Text>{item.doseNumber}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Χορήγησης: </Text>{formatDate(item.administeredDate)}
      </Text>
      <RetractedNote retraction={item.retraction} />
      {extra}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εμβολιασμοί</Text>
        <Text style={doctorStyles.historyPatientName}>{patientName}</Text>
      </View>

      {/* Μόνο ο τίτλος (historyHeader) μένει σταθερός στην κορυφή· τα υπόλοιπα μπαίνουν στο
          ListHeaderComponent, οπότε κυλούν μαζί με τη λίστα. */}
      <SectionList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        sections={sections}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <YearSectionHeader title={section.title} />}
        keyExtractor={(group) => group.key}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {!isReadOnly && (
                <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
                  <Text style={styles.addButtonText}>+ Προσθήκη Εμβολιασμού</Text>
                </TouchableOpacity>
              )}

              {/* Με λιγότερες από 2 εγγραφές η σειρά δεν αλλάζει τίποτα - δεν χρειάζεται φίλτρο. */}
              {vaccinations.length >= 2 && (
                <SortDropdown
                  value={newestFirst}
                  onChange={setNewestFirst}
                  newestLabel="Νεότεροι προς Παλαιότεροι"
                  oldestLabel="Παλαιότεροι προς Νεότεροι"
                />
              )}
            </View>

            <RecordSearchBar
              label="Αναζήτηση εμβολιασμού:"
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
              {searching ? 'Δεν βρέθηκε εμβολιασμός με αυτά τα στοιχεία.' : 'Δεν υπάρχουν εμβολιασμοί.'}
            </Text>
          )
        }
        renderItem={({ item: group }) => {
          const isExpanded = expandedGroups.has(group.key);
          const hasPreviousDoses = group.previousDoses.length > 0;

          // Το κουμπί εμφάνισης/απόκρυψης ζει ΜΕΣΑ στην κάρτα της πιο πρόσφατης δόσης, όπως
          // ακριβώς τα "Συνημμένα Αρχεία" στις Νοσηλείες - φωλιασμένο TouchableOpacity μέσα σε
          // άλλο, που στο React Native παίρνει το δικό του πάτημα χωρίς να ανοίγει και την
          // αναλυτική προβολή της κάρτας.
          const toggleButton = hasPreviousDoses ? (
            <TouchableOpacity
              style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginBottom: 0, marginTop: 12 }]}
              onPress={() => toggleGroup(group.key)}
            >
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={doctorStyles.diagnosisSortButtonText}>
                {isExpanded
                  ? 'Απόκρυψη προηγούμενων δόσεων'
                  : group.previousDoses.length === 1 ? '1 προηγούμενη δόση' : `${group.previousDoses.length} προηγούμενες δόσεις`}
              </Text>
            </TouchableOpacity>
          ) : null;

          return (
            <>
              {renderVaccinationCard(group.latest, toggleButton)}
              {isExpanded && group.previousDoses.map((dose) => (
                <View key={dose.url} style={localStyles.previousDoseWrapper}>
                  {renderVaccinationCard(dose)}
                </View>
              ))}
            </>
          );
        }}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Μικρή εσοχή αριστερά, ώστε οι παλαιότερες δόσεις να διαβάζονται σαν "μέσα" στην ομάδα
  // της πιο πρόσφατης, όχι σαν απλά επόμενες κάρτες της λίστας.
  previousDoseWrapper: { marginLeft: 16 },
});
