import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, SectionList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord, compareNewestFirst, timeOf } from '../../../utils/podRecords';
import { groupByYearRetractedLast } from '../../../utils/groupByYear';
import { YearSectionHeader } from '../../../components/YearSectionHeader';
import { parseRetraction, Retraction } from '../../../utils/recordRevision';
import { RetractedNote, retractedCardStyle } from '../../../components/RetractedNote';
import { retractRecord } from '../../../services/recordRevisions';
import { resolveRecordAuthor } from '../../../utils/recordAuthor';
import { RecordCardActions } from '../../../components/RecordCardActions';
import { useRecordSearch } from '../../../utils/recordSearch';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, getCategoryFolderUrl, downloadAttachment, isPodAccessDenied, isPodTokenExpired } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { openLocalFile } from '../../../utils/openLocalFile';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { askText, showMessage } from '../../../utils/appMessage';
import { friendlyErrorMessage } from '../../../utils/networkError';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Νοσηλείες';

interface Hospitalization {
  url: string;
  // Συμπληρωμένο μόνο όταν η εγγραφή έχει ανακληθεί - σημανθεί δηλαδή ως λανθασμένη.
  retraction?: Retraction;
  title: string;
  hospitalClinic: string;
  doctorName: string;
  doctorAmka: string;
  hospitalArea?: string;
  admissionDate: string;
  dischargeDate: string;
  attachments: string[];
  // Κωδικός ICD-10 του λόγου νοσηλείας. Λείπει από τις παλιές εγγραφές.
  code?: string;
  parentName?: string;
  // Οι εγγραφές με τις οποίες ο γιατρός συνέδεσε τη νοσηλεία.
  links?: LinkedRecord[];
}

export default function DoctorHospitalizationsScreen() {
  const { amka, firstName, lastName, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const patientName = `${firstName} ${lastName}`;
  const { accessToken, loggedInDoctorAmka, logout } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  // Ό,τι έχει μείνει στη μνήμη από προηγούμενη επίσκεψη στην ίδια κατηγορία.
  const cachedRecords = getCachedRecords<Hospitalization>(webId, CATEGORY) ?? [];

  // Ξεκινάμε σε κατάσταση φόρτωσης όταν δεν έχουμε τίποτα να δείξουμε. Αλλιώς το
  // "δεν υπάρχουν εγγραφές" προλαβαίνει να εμφανιστεί πριν καν ρωτήσουμε το Pod.
  const [loading, setLoading] = useState(cachedRecords.length === 0);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>(cachedRecords);

  // Διαγραφές και επεξεργασίες αλλάζουν τη λίστα χωρίς να ξαναδιαβαστεί το Pod. Περνούν
  // από εδώ ώστε η μνήμη να μη μείνει με εγγραφή που δεν υπάρχει πια.
  const updateHospitalizations = (change: (prev: Hospitalization[]) => Hospitalization[]) => {
    setHospitalizations((prev) => {
      const next = change(prev);
      setCachedRecords(webId, CATEGORY, next);
      return next;
    });
  };

  const [viewingAttachmentsFor, setViewingAttachmentsFor] = useState<Hospitalization | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  const loadHospitalizations = async (silent = false) => {
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && hospitalizations.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

      const hospitalizationFiles = files.filter((url) => url.endsWith('.json'));

      const valid = await loadProgressively<Hospitalization>({
        urls: hospitalizationFiles,
        parse: async (url) => {
          try {
            const content = await fetchFileContent(url, accessToken);
            const record = JSON.parse(content);
            // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
            if (!isCompleteRecord('Νοσηλείες', record)) return null;
            return {
              url,
              retraction: parseRetraction(record),
              title: record.title,
              code: record.code,
              parentName: record.parentName,
              hospitalClinic: record.hospitalClinic,
              hospitalArea: record.hospitalArea,
              doctorName: record.doctorName,
              doctorAmka: record.doctorAmka,
              admissionDate: record.admissionDate,
              dischargeDate: record.dischargeDate,
              attachments: record.attachments || [],
              links: readLinks(record),
            } as Hospitalization;
          } catch (error: any) {
            console.warn('⚠️ Αποτυχία φόρτωσης νοσηλείας', url, error?.message || error);
            return null;
          }
        },
        // Σταδιακή εμφάνιση μόνο σε άδεια οθόνη. Με γεμάτη μνήμη ή σε σιωπηλή
        // ανανέωση θα αντικαθιστούσαμε πλήρη λίστα με μία που μεγαλώνει.
        onPartial: !silent && hospitalizations.length === 0 ? (records) => setHospitalizations(records) : undefined,
      });

      setHospitalizations(valid);
      setCachedRecords(webId, CATEGORY, valid);
      ensureDoctorInfo(valid.map((h) => h.doctorAmka));
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
    loadHospitalizations();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadHospitalizations);

  const displayDoctorName = (item: Hospitalization) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const openForm = (item?: Hospitalization) => {
    router.push({
      pathname: ROUTES.HOSPITALIZATION_FORM,
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
          editHospitalClinic: item.hospitalClinic,
          editHospitalArea: item.hospitalArea,
          editAdmissionDate: item.admissionDate,
          editDischargeDate: item.dischargeDate,
          editAttachments: JSON.stringify(item.attachments || []),
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
          editLinks: item.links?.length ? JSON.stringify(item.links) : '',
        } : {}),
      },
    });
  };

  const openDetail = (item: Hospitalization) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: CATEGORY, webId, amka, firstName, lastName } });
  };

  // Καμία εγγραφή δεν σβήνεται από την εφαρμογή. Η λανθασμένη ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα
  // και μένει ορατή: αλλιώς δεν θα φαινόταν ούτε ότι γράφτηκε ποτέ ούτε γιατί αποσύρθηκε.
  const handleRetractHospitalization = async (item: Hospitalization) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const reason = await askText({
      message: 'Ανάκληση: η νοσηλεία δεν διαγράφεται, σημαίνεται ως αποσυρμένη. Για ποιον λόγο;',
      placeholder: 'π.χ. καταχωρήθηκε σε λάθος ασθενή',
      confirmText: 'Ανάκληση',
    });
    if (!reason) return;

    try {
      const author = await resolveRecordAuthor('doctor', loggedInDoctorAmka, '');
      const retraction = await retractRecord(item.url, accessToken, author, reason);
      updateHospitalizations((prev) => prev.map((h) => (h.url === item.url ? { ...h, retraction } : h)));
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, 'Αποτυχία ανάκλησης.'));
    }
  };

  const handleOpenAttachment = async (item: Hospitalization, fileName: string) => {
    try {
      setDownloadingAttachment(fileName);
      const localUri = await downloadAttachment(item.url, fileName, accessToken);
      await openLocalFile(localUri, fileName);
    } catch (error: any) {
      showMessage(friendlyErrorMessage(error, 'Αποτυχία ανοίγματος αρχείου.'));
    } finally {
      setDownloadingAttachment(null);
    }
  };

  // Η αναζήτηση πιάνει και το νοσοκομείο με την πόλη του, εκτός από την αιτία νοσηλείας.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: foundHospitalizations } =
    useRecordSearch(hospitalizations, (item) => [item.title, item.code, item.parentName, item.hospitalClinic, item.hospitalArea]);

  // Πιο πρόσφατη ημερομηνία εισαγωγής πρώτη.
  const sortedHospitalizations = useMemo(
    () => [...foundHospitalizations].sort((a, b) => compareNewestFirst(timeOf(a.admissionDate), timeOf(b.admissionDate))),
    [foundHospitalizations],
  );

  // Ομαδοποίηση ανά έτος, ώστε να υπάρχει σημείο αναφοράς καθώς κατεβαίνει η λίστα.
  const sections = useMemo(
    () => groupByYearRetractedLast(sortedHospitalizations, (item) => timeOf(item.admissionDate)),
    [sortedHospitalizations],
  );

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Νοσηλείες</Text>
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
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {!isReadOnly && (
              <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
                <Text style={styles.addButtonText}>+ Προσθήκη Νοσηλείας</Text>
              </TouchableOpacity>
              )}
            </View>

            <RecordSearchBar
              label="Αναζήτηση νοσηλείας:"
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
            <Text style={styles.emptyText}>
              {searching ? 'Δεν βρέθηκε νοσηλεία με αυτά τα στοιχεία.' : 'Δεν υπάρχουν νοσηλείες.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[doctorStyles.diagnosisCard, item.retraction && retractedCardStyle]} onPress={() => openDetail(item)}>
            <View style={doctorStyles.diagnosisCardHeader}>
              <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
              <RecordCardActions
                visible={!isReadOnly && (item.doctorAmka === loggedInDoctorAmka) && !item.retraction}
                onEdit={() => openForm(item)}
                onRetract={() => handleRetractHospitalization(item)}
              />
            </View>

            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Νοσοκομείο / Κλινική: </Text>{item.hospitalClinic}{item.hospitalArea ? ` (${item.hospitalArea})` : ''}
            </Text>
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
            </Text>
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εισαγωγής: </Text>{formatDate(item.admissionDate)}
            </Text>
            <Text style={doctorStyles.diagnosisCardDetail}>
              <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Εξιτηρίου: </Text>{formatDate(item.dischargeDate)}
            </Text>

            <TouchableOpacity
              style={[doctorStyles.diagnosisSortButton, { flexDirection: 'row', marginHorizontal: 0, marginBottom: 0, marginTop: 12 }]}
              onPress={() => setViewingAttachmentsFor(item)}
            >
              <Ionicons name="link-outline" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
              <Text style={doctorStyles.diagnosisSortButtonText}>Συνημμένα Αρχεία</Text>
            </TouchableOpacity>
            <RetractedNote retraction={item.retraction} />
          </TouchableOpacity>
        )}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={!!viewingAttachmentsFor}
        onRequestClose={() => setViewingAttachmentsFor(null)}
      >
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Συνημμένα Αρχεία</Text>
              <TouchableOpacity
                onPress={() => setViewingAttachmentsFor(null)}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {(!viewingAttachmentsFor?.attachments || viewingAttachmentsFor.attachments.length === 0) ? (
              <Text style={styles.emptyText}>Δεν υπάρχουν συνημμένα αρχεία.</Text>
            ) : (
              viewingAttachmentsFor.attachments.map((fileName) => (
                <TouchableOpacity
                  key={fileName}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.medium }}
                  onPress={() => handleOpenAttachment(viewingAttachmentsFor, fileName)}
                  disabled={downloadingAttachment === fileName}
                >
                  <Ionicons name="document-outline" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1 }} numberOfLines={1}>{fileName}</Text>
                  {downloadingAttachment === fileName && <ActivityIndicator size="small" color={COLORS.primary} />}
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
