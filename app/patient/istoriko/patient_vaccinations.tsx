import React, { useEffect, useState, useMemo } from 'react';
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
import { RecordCardActions } from '../../../components/RecordCardActions';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { askText, showMessage } from '../../../utils/appMessage';
import { useRecordSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
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
  // Κωδικός του διεθνούς προτύπου (ICD-10 / ATC / LOINC) και η κατηγορία στην οποία ανήκει,
  // όπως τα κατέγραψε ο γιατρός. Λείπουν από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

export default function PatientVaccinationsScreen() {
  const { accessToken, activePatientFolderUrl, loggedInPatientAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Vaccination>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [vaccinations, setVaccinations] = useState<Vaccination[]>(cachedRecords);

  // Η ανάκληση αλλάζει τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνά από εδώ ώστε η μνήμη
  // να μη μείνει με την προηγούμενη εικόνα της εγγραφής.
  const updateVaccinations = (change: (prev: Vaccination[]) => Vaccination[]) => {
    setVaccinations((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };
  const [newestFirst, setNewestFirst] = useState(true);

  const loadVaccinations = async (silent = false) => {
    try {
      if (!silent && vaccinations.length === 0) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί εμβολιασμοί.
          files = [];
        }
      }

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
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setVaccinations([]);
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

  const sortedVaccinations = useMemo(() => {
    return [...foundVaccinations].sort((a, b) => {
      const diff = new Date(b.administeredDate).getTime() - new Date(a.administeredDate).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [foundVaccinations, newestFirst]);

  // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
  // Ο ασθενής καταχωρεί στον ΔΙΚΟ ΤΟΥ φάκελο, οπότε δεν περνάμε ΑΜΚΑ ούτε τύπο πρόσβασης:
  // δεν υπάρχει καταχώρηση πρόσβασης να ελεγχθεί. Είναι η ίδια φόρμα που χρησιμοποιεί ο
  // γιατρός - αναγνωρίζει από τον ρόλο ότι γράφει ο ασθενής και υπογράφει "κος/κα" αντί "Δρ.".
  const openAddForm = () => {
    router.push({ pathname: ROUTES.VACCINATION_FORM, params: { webId } });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractVaccination = async (item: Vaccination) => {
    const reason = await askText({
      message: 'Ανάκληση: ο εμβολιασμός δεν διαγράφεται, σημαίνεται ως αποσυρμένος. Για ποιον λόγο;',
      placeholder: 'π.χ. τον καταχώρησα δύο φορές',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('patient', '', loggedInPatientAmka);
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateVaccinations((prev) => prev.map((v) => (v.url === item.url ? { ...v, retraction } : v)));
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανάκλησης.');
    }
  };

  const openDetail = (item: { url: string }) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: 'Εμβολιασμοί', webId } });
  };

  // Ομαδοποίηση ανά έτος, ώστε να υπάρχει σημείο αναφοράς καθώς κατεβαίνει η λίστα.
  const sections = useMemo(
    () => groupByYearRetractedLast(sortedVaccinations, (item) => timeOf(item.administeredDate)),
    [sortedVaccinations],
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εμβολιασμοί</Text>
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
            <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddForm}>
                <Text style={styles.addButtonText}>+ Προσθήκη Εμβολιασμού</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setNewestFirst((prev) => !prev)}>
              <Text style={doctorStyles.diagnosisSortButtonText}>
                ↕ {newestFirst ? 'Νεότεροι προς Παλαιότεροι' : 'Παλαιότεροι προς Νεότεροι'}
              </Text>
            </TouchableOpacity>

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
            <Text style={[styles.emptyText, { marginTop: 30 }]}>
              {searching ? 'Δεν βρέθηκε εμβολιασμός με αυτά τα στοιχεία.' : 'Δεν υπάρχουν εμβολιασμοί ακόμα.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
            <View style={doctorStyles.diagnosisCardHeader}>
              <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
              {/* Ο ασθενής ανακαλεί μόνο ό,τι καταχώρησε ο ίδιος: εγγραφή γιατρού δεν την
                  αγγίζει, αλλιώς ο φάκελος παύει να είναι αξιόπιστος για τον επόμενο γιατρό. */}
              <RecordCardActions
                visible={item.doctorAmka === loggedInPatientAmka && !item.retraction}
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
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
