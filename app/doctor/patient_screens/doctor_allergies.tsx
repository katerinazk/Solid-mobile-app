import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
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
import { isCompleteRecord, compareNewestFirst, createdAtFromUrl } from '../../../utils/podRecords';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { listFolderFilesOrEmpty, fetchFileContent, deleteFile, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';
import { askConfirm, showMessage } from '../../../utils/appMessage';
import { getCachedRecords, setCachedRecords } from '../../../utils/recordCache';
import { loadProgressively } from '../../../utils/progressiveLoad';

const CATEGORY = 'Αλλεργίες';

interface Allergy {
  url: string;
  title: string;
  reaction: string;
  doctorName: string;
  doctorAmka: string;
  // Κωδικός ICD-10 ή ATC. Λείπει από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

export default function DoctorAllergiesScreen() {
  const { amka, webId, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

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
    if (!webId) {
      setLoading(false);
      return showMessage("Ο ασθενής δεν έχει συνδέσει προσωπικό χώρο (Pod).");
    }
    try {
      if (!silent && allergies.length === 0) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);

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
              title: record.title,
              code: record.code,
              parentName: record.parentName,
              reaction: record.reaction,
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
    loadAllergies();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadAllergies);

  const displayDoctorName = (item: Allergy) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const openForm = (item?: Allergy) => {
    router.push({
      pathname: ROUTES.DOCTOR_ALLERGY_FORM,
      params: {
        amka,
        webId,
        accessType,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editReaction: item.reaction,
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  const handleDeleteAllergy = async (item: Allergy) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    const confirmed = await askConfirm({
      message: "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την αλλεργία;",
      confirmText: "Διαγραφή",
      cancelText: "Ακύρωση",
    });
    if (!confirmed) return;

    try {
      await deleteFile(item.url, accessToken);
      updateAllergies((prev) => prev.filter((a) => a.url !== item.url));
    } catch (error: any) {
      showMessage(error.message || "Αποτυχία διαγραφής.");
    }
  };

  // Η κάρτα ανοίγει την αναλυτική προβολή. Τα εικονίδια μέσα της κρατούν το δικό τους πάτημα.
  const openDetail = (item: { url: string }) => {
    router.push({ pathname: ROUTES.RECORD_DETAIL, params: { url: item.url, category: 'Αλλεργίες', webId } });
  };

  // Πέντε καταχωρήσεις ανά σελίδα. Η σελιδοποίηση εφαρμόζεται σε ό,τι βλέπει τελικά ο
  // χρήστης, δηλαδή μετά από φίλτρα και ταξινόμηση.
  // Πιο πρόσφατες πρώτα. Οι αλλεργίες δεν έχουν δικό τους πεδίο ημερομηνίας, οπότε η σειρά
  // βγαίνει από τη σήμανση του ονόματος αρχείου - την ίδια που ακολουθεί και η φόρτωση.
  const sortedAllergies = useMemo(
    () => [...allergies].sort((a, b) => compareNewestFirst(createdAtFromUrl(a.url), createdAtFromUrl(b.url))),
    [allergies],
  );

  const { pageItems, page, pageCount, setPage } = usePagination(sortedAllergies);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Αλλεργίες</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {!isReadOnly && (
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
          <Text style={styles.addButtonText}>+ Προσθήκη Αλλεργίας</Text>
        </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : allergies.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν αλλεργίες.</Text>
      ) : (
        <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          data={pageItems}
          ListFooterComponent={<Pagination page={page} pageCount={pageCount} onChange={setPage} />}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <TouchableOpacity style={doctorStyles.diagnosisCard} onPress={() => openDetail(item)}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                {!isReadOnly && item.doctorAmka === loggedInDoctorAmka && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => openForm(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteAllergy(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αντίδραση: </Text>{item.reaction}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}
