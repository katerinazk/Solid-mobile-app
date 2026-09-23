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
import { isCompleteRecord, compareNewestFirst, createdDateFromUrl, timeOf } from '../../../utils/podRecords';
import { formatDate } from '../../../utils/age';
import { groupByYearRetractedLast } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { useRecordSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askText, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Αλλεργίες';

interface Allergy {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
  title: string;
  reaction: string;
  // Ημερομηνία καταχώρησης. Γράφεται μέσα στο αρχείο από τη φόρμα. Για τις παλιές
  // εγγραφές, που δεν την έχουν, προκύπτει από τη σήμανση του ονόματος αρχείου.
  createdDate: string;
  doctorName: string;
  doctorAmka: string;
  // Κωδικός του διεθνούς προτύπου (ICD-10 / ATC / LOINC) και η κατηγορία στην οποία ανήκει,
  // όπως τα κατέγραψε ο γιατρός. Λείπουν από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

export default function PatientAllergiesScreen() {
  const { accessToken, loggedInPatientAmka, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Allergy>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [allergies, setAllergies] = useState<Allergy[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateAllergies = (change: (prev: Allergy[]) => Allergy[]) => {
    setAllergies((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };
  const loadAllergies = async (silent = false) => {
    try {
      if (!silent && allergies.length === 0) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί αλλεργίες.
          files = [];
        }
      }

      const allergyFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Allergy>({
        urls: allergyFiles,
        parse: async (url) => {
          try {
            const content = await fetchFileContent(url, accessToken);
            const record = JSON.parse(content);
            // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
            if (!isCompleteRecord('Αλλεργίες', record)) return null;
            return {
              url,
              retraction: parseRetraction(record),
              title: record.title,
              code: record.code,
              parentName: record.parentName,
              reaction: record.reaction,
              // Οι εγγραφές που γράφτηκαν πριν μπει το πεδίο δεν έχουν ημερομηνία μέσα τους:
              // για εκείνες τη βγάζουμε από τη σήμανση του ονόματος αρχείου.
              createdDate: record.createdDate || createdDateFromUrl(url),
              doctorName: record.doctorName,
              doctorAmka: record.doctorAmka,
            } as Allergy;
          } catch {
            return null;
          }
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && allergies.length === 0 ? (records) => setAllergies(records) : undefined,
      });

      setAllergies(valid);
      setCachedRecords(webId, CATEGORY, valid);
      ensureDoctorInfo(valid.map((a) => a.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setAllergies([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadAllergies();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadAllergies);

  const displayDoctorName = (item: Allergy) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  // Η καταχώρηση γίνεται πλέον στην ίδια οθόνη-φόρμα που χρησιμοποιεί ο γιατρός, ώστε ο
  // ασθενής να διαλέγει κι αυτός κωδικό από τον διεθνή κατάλογο.
  //
  // Πριν, η οθόνη είχε δικό της παράθυρο με ελεύθερο κείμενο. Η αλλεργία αποθηκευόταν χωρίς
  // πεδίο code, ο έλεγχος πληρότητας την απέρριπτε ως ελλιπή στην επόμενη ανάγνωση του Pod,
  // και έτσι εξαφανιζόταν μόνη της λίγο μετά την καταχώρηση.
  const openAddForm = () => {
    router.push({ pathname: ROUTES.ALLERGY_FORM, params: { webId } });
  };

  const openEditForm = (item: Allergy) => {
    router.push({
      pathname: ROUTES.ALLERGY_FORM,
      params: {
        webId,
        editUrl: item.url,
        editCode: item.code,
        editTitle: item.title,
        editParentName: item.parentName,
        editReaction: item.reaction,
        editCreatedDate: item.createdDate,
        editDoctorName: item.doctorName,
        editDoctorAmka: item.doctorAmka,
      },
    });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractAllergy = async (item: Allergy) => {
    const reason = await askText({
      message: 'Ανάκληση: η αλλεργία δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. καταχωρήθηκε σε λάθος ασθενή',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('patient', '', loggedInPatientAmka);
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateAllergies((prev) => prev.map((a) => (a.url === item.url ? { ...a, retraction } : a)));
    } catch (error: any) {
      showMessage(error.message || 'Αποτυχία ανάκλησης.');
    }
  };

  // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
  const openDetail = (item: { url: string }) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: 'Αλλεργίες', webId } });
  };

  // Η αναζήτηση πιάνει όσα δείχνει η κάρτα: όνομα, κωδικό, κατηγορία κωδικού, αντίδραση.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: foundAllergies } =
    useRecordSearch(allergies, (item) => [item.title, item.code, item.parentName, item.reaction]);

  // Πιο πρόσφατες πρώτα, κατά ημερομηνία καταχώρησης.
  const sortedAllergies = useMemo(
    () => [...foundAllergies].sort((a, b) => compareNewestFirst(timeOf(a.createdDate), timeOf(b.createdDate))),
    [foundAllergies],
  );

  // Ομαδοποίηση ανά έτος, με βάση την ημερομηνία καταχώρησης.
  const sections = useMemo(
    () => groupByYearRetractedLast(sortedAllergies, (item) => timeOf(item.createdDate)),
    [sortedAllergies],
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Αλλεργίες</Text>
      </View>

      {/* Μόνο ο τίτλος (historyHeader) μένει σταθερός στην κορυφή· τα υπόλοιπα μπαίνουν στο
          ListHeaderComponent, οπότε κυλούν μαζί με τη λίστα. */}
      <SectionList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        sections={sections}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => <YearSectionHeader title={section.title} />}
        keyExtractor={(item) => item.url}
        contentContainerStyle={{ paddingTop: SPACING.sectionGap, paddingBottom: SPACING.bottomMargin }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={openAddForm}>
                <Text style={styles.addButtonText}>+ Προσθήκη Αλλεργίας</Text>
              </TouchableOpacity>
            </View>

            <RecordSearchBar
              label="Αναζήτηση αλλεργίας:"
              value={searchQuery}
              onChange={setSearchQuery}
              visible={searchVisible}
            />
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
          ) : (
            <Text style={[styles.emptyText, { marginTop: 30 }]}>
              {searching ? 'Δεν βρέθηκε αλλεργία με αυτά τα στοιχεία.' : 'Δεν υπάρχουν αλλεργίες ακόμα.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
            <View style={doctorStyles.diagnosisCardHeader}>
              <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
              <RecordCardActions
                visible={item.doctorAmka === loggedInPatientAmka && !item.retraction}
                onEdit={() => openEditForm(item)}
                onRetract={() => handleRetractAllergy(item)}
              />
            </View>

            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Αντίδραση: </Text>{item.reaction}
            </Text>
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Καταχώρησης: </Text>{formatDate(item.createdDate)}
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
