import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { usePagination } from '../../../hooks/usePagination';
import { Pagination } from '../../../components/Pagination';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord } from '../../../utils/podRecords';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, deleteFile, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { formatDuration, medicationEndDate } from '../../../utils/duration';
import { LinkedRecord, readLinks } from '../../../services/historyRecords';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askConfirm, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Φάρμακα';

interface Medication {
  url: string;
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

function MedicationCard({ item, doctorDisplayName, loggedInDoctorAmka, allowEdit, onEdit, onDelete, onOpen }: { item: Medication; doctorDisplayName: string; loggedInDoctorAmka: string; allowEdit: boolean; onEdit: (item: Medication) => void; onDelete: (item: Medication) => void; onOpen: (item: Medication) => void }) {
  return (
    // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους
    // πάτημα, οπότε δεν ανοίγουν κατά λάθος την προβολή.
    <TouchableOpacity style={doctorStyles.diagnosisCard} onPress={() => onOpen(item)}>
      <View style={doctorStyles.diagnosisCardHeader}>
        <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
        {allowEdit && item.doctorAmka === loggedInDoctorAmka && (
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

  const [loading, setLoading] = useState(false);
  // Ξεκινάμε από ό,τι έχει μείνει στη μνήμη: η οθόνη εμφανίζεται αμέσως και το Pod
  // ξαναδιαβάζεται στο παρασκήνιο για να φανεί τυχόν αλλαγή.
  const [medications, setMedications] = useState<Medication[]>(() => getCachedRecords<Medication>(webId, CATEGORY) ?? []);

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
  const [searchQuery, setSearchQuery] = useState('');

  const loadMedications = async (silent = false) => {
    if (!webId) return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
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
      pathname: ROUTES.DOCTOR_MEDICATION_FORM,
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

  const handleDeleteMedication = async (item: Medication) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const confirmed = await askConfirm({
      message: "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το φάρμακο;",
      confirmText: "Διαγραφή",
      cancelText: "Ακύρωση",
    });
    if (!confirmed) return;

    try {
      await deleteFile(item.url, accessToken);
      updateMedications((prev) => prev.filter((m) => m.url !== item.url));
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία διαγραφής.");
    }
  };

  const { activeMedications, previousMedications } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const query = searchQuery.trim().toLowerCase();

    const active: Medication[] = [];
    const previous: Medication[] = [];

    for (const med of medications) {
      if (query && !med.title?.toLowerCase().includes(query)) continue;

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

    return { activeMedications: active, previousMedications: previous };
  }, [medications, searchQuery]);

  // Όταν ο γιατρός ψάχνει κάτι, ανοίγουμε αυτόματα και την "Προηγούμενη Αγωγή" - αλλιώς ένα
  // αποτέλεσμα που βρίσκεται εκεί θα έμενε κρυμμένο πίσω από το κλειστό section.
  // Πέντε φάρμακα ανά σελίδα σε κάθε ενότητα. Οι δύο ενότητες σελιδοποιούνται χωριστά,
  // ώστε να μη μετακινεί η μία τα περιεχόμενα της άλλης.
  const activePager = usePagination(activeMedications);
  const previousPager = usePagination(previousMedications);

  const previousSectionOpen = showPrevious || (searchQuery.trim().length > 0 && previousMedications.length > 0);

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

        <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.sectionGap }}>
          <Text style={doctorStyles.dashboardLabel}>Αναζήτηση φαρμάκου:</Text>
          <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <TextInput
              style={doctorStyles.searchInput}
              placeholder="Αναζήτηση..."
              placeholderTextColor={COLORS.primary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ενεργή Αγωγή</Text>

          {activeMedications.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ενεργές αγωγές.</Text>
          ) : (
            activePager.pageItems.map((item) => <MedicationCard key={item.url} item={item} doctorDisplayName={displayDoctorName(item)} loggedInDoctorAmka={loggedInDoctorAmka} allowEdit={!isReadOnly} onEdit={openForm} onDelete={handleDeleteMedication} onOpen={openDetail} />)
          )}

          <Pagination page={activePager.page} pageCount={activePager.pageCount} onChange={activePager.setPage} />

          {/* Χωρίς εγγραφές δεν δείχνουμε ούτε τον τίτλο: μια κεφαλίδα που ανοίγει
              σε άδειο περιεχόμενο δεν προσφέρει τίποτα στον χρήστη. */}
          {previousMedications.length > 0 && (
            <>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10 }}
                onPress={() => setShowPrevious((prev) => !prev)}
              >
                <Ionicons name={previousSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
                <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
              </TouchableOpacity>

              {previousSectionOpen && (
                <View style={{ marginTop: 12 }}>
                  {previousPager.pageItems.map((item) => <MedicationCard key={item.url} item={item} doctorDisplayName={displayDoctorName(item)} loggedInDoctorAmka={loggedInDoctorAmka} allowEdit={false} onEdit={openForm} onDelete={handleDeleteMedication} onOpen={openDetail} />)}

                  <Pagination page={previousPager.page} pageCount={previousPager.pageCount} onChange={previousPager.setPage} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
