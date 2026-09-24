import React, { useCallback, useMemo, useState } from 'react';
import { Text, View, FlatList, ScrollView, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { usePatientAccessActions } from '../../../hooks/usePatientAccessActions';
import { fetchAccessEntry, addAccess } from '../../../services/access';
import { fetchPendingAccessRequestsForPatient, resolveAccessRequest } from '../../../services/accessRequests';
import { updatePodAcl } from '../../../services/solidPod';
import { Dropdown } from 'react-native-element-dropdown';
import { ACCESS_TYPES, GRANTABLE_ACCESS_TYPES } from '../../../constants/accessTypes';
import { AccessCard } from '../../../components/AccessCard';
import { RecordSearchBar } from '../../../components/RecordSearchBar';
import { useRecordSearch } from '../../../utils/recordSearch';
import { showMessage } from '../../../utils/appMessage';
import { friendlyErrorMessage } from '../../../utils/networkError';

// Οι επιλογές του φίλτρου. Η πρώτη είναι η "χωρίς φίλτρο", ώστε να υπάρχει δρόμος πίσω.
const ALL_ACCESS = 'Όλες οι προσβάσεις';
const ACCESS_FILTERS = [ALL_ACCESS, ...ACCESS_TYPES];

// Η βιβλιοθήκη του dropdown θέλει αντικείμενα με ετικέτα και τιμή, όχι σκέτες συμβολοσειρές.
const GRANTABLE_ACCESS_OPTIONS = GRANTABLE_ACCESS_TYPES.map((type) => ({ label: type, value: type }));

interface AccessRequest {
  id: string;
  doctor_amka: string;
  access_type: string;
  doctors: { first_name: string; last_name: string; specialty: string | null; web_id: string | null } | null;
}

export default function PatientAccessScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const { accessList, setAccessList, loading, error: accessListError, refresh } = usePatientAccessList();
  const {
    savingChange,
    savedTypeAmkas,
    resetSavedTypeAmkas,
    deletingAmka,
    confirmChangeAccessType,
    handleSelectAccessType,
    handleDeleteAccess,
  } = usePatientAccessActions(accessList, setAccessList, refresh);

  // Η λίστα ξαναδιαβάζεται κάθε φορά που η οθόνη ξαναπαίρνει εστίαση - ιδίως γυρίζοντας από
  // την "Προσθήκη Πρόσβασης", όπου μπορεί να προστέθηκε νέος γιατρός. Οι επιβεβαιώσεις τύπου
  // πρόσβασης καθαρίζουν μαζί, ώστε επιστρέφοντας αργότερα να μη φαίνονται παλιά πράσινα.
  useFocusEffect(useCallback(() => {
    refresh();
    return () => resetSavedTypeAmkas();
  }, [refresh]));

  const [accessFilter, setAccessFilter] = useState(ALL_ACCESS);
  // Ανοίγει ΚΑΤΩ από το κουμπί, μέσα στη ροή της σελίδας - σπρώχνει τις κάρτες από κάτω, όπως
  // όλα τα άλλα dropdown της εφαρμογής (π.χ. SortDropdown), αντί να επιπλέει σε Modal από πάνω.
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const visibleAccessList = useMemo(
    () => accessFilter === ALL_ACCESS ? accessList : accessList.filter((a) => a.access_type === accessFilter),
    [accessList, accessFilter]
  );

  // Φιλτράρει μόνο ΜΕΣΑ στους γιατρούς που έχει ήδη πρόσβαση ο ασθενής - όχι σε όλη τη βάση.
  // Η αναζήτηση σε όλη τη βάση, για να δοθεί ΝΕΑ πρόσβαση, γίνεται στην άλλη οθόνη.
  const { query: searchQuery, setQuery: setSearchQuery, searchVisible, searching, results: searchedAccessList } =
    useRecordSearch(visibleAccessList, (item) => [item.doctors?.first_name, item.doctors?.last_name]);

  const [isRequestsModalVisible, setIsRequestsModalVisible] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  const handleChangeRequestType = (requestId: string, newType: string) => {
    setRequests((prev) => prev.map((r) => r.id === requestId ? { ...r, access_type: newType } : r));
  };

  const openRequestsModal = async () => {
    setIsRequestsModalVisible(true);
    try {
      setLoadingRequests(true);
      const { data, error } = await fetchPendingAccessRequestsForPatient(loggedInPatientAmka);
      if (error) {
        showMessage(friendlyErrorMessage(error, "Σφάλμα φόρτωσης αιτημάτων."));
        return;
      }
      setRequests((data || []) as unknown as AccessRequest[]);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleAcceptRequest = async (request: AccessRequest) => {
    try {
      setResolvingRequestId(request.id);

      // Ίδιοι έλεγχοι με τη χειροκίνητη προσθήκη - το αίτημα μπορεί να έμεινε εκκρεμές αφότου
      // ο ασθενής έδωσε ήδη πρόσβαση στον ίδιο γιατρό με το χέρι.
      const { data: existingAccess } = await fetchAccessEntry(loggedInPatientAmka, request.doctor_amka);
      if (existingAccess) {
        if (existingAccess.access_type !== request.access_type) {
          await confirmChangeAccessType(
            request.doctor_amka,
            request.doctors?.web_id || null,
            request.access_type,
            "Υπάρχει ήδη πρόσβαση",
            `Έχετε ήδη δώσει "${existingAccess.access_type}" σε αυτόν τον γιατρό. Θέλετε να την αλλάξετε σε "${request.access_type}";`,
          );
        } else {
          showMessage("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        }
        // Είτε άλλαξε ο τύπος είτε όχι, ο γιατρός έχει πρόσβαση - το αίτημα δεν έχει λόγο να μείνει.
        await resolveAccessRequest(request.id, 'accepted');
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, request.doctor_amka, request.access_type, !!request.doctors?.web_id);
      if (error) {
        showMessage(friendlyErrorMessage(error, "Σφάλμα."));
        return;
      }

      // Όπως και στη χειροκίνητη προσθήκη: χωρίς WebID το αίτημα γίνεται κανονικά δεκτό και ο
      // γιατρός μπαίνει στο ACL με τον επόμενο συγχρονισμό.
      if (request.doctors?.web_id) {
        await updatePodAcl({
          activePatientFolderUrl,
          accessToken,
          accessList,
          newDoctorWebId: request.doctors.web_id,
          accessType: request.access_type,
        });
      }

      await resolveAccessRequest(request.id, 'accepted');
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      refresh();
      showMessage(`Η πρόσβαση στον Δρ. ${request.doctors?.last_name || ''} δόθηκε επιτυχώς!`);
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleRejectRequest = async (request: AccessRequest) => {
    try {
      setResolvingRequestId(request.id);
      await resolveAccessRequest(request.id, 'rejected');
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setResolvingRequestId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      {/* Ίδιο μπλε φόντο πίσω από τον τίτλο, με την ίδια γραμματοσειρά/κεντράρισμα όπως στους
          τίτλους των υπόλοιπων οθονών (historyHeader/historyTitle) - χωρίς βέλος επιστροφής,
          αφού αυτή είναι καρτέλα, όχι οθόνη πάνω σε στοίβα. Αδερφικό στοιχείο πριν το FlatList,
          οπότε μένει σταθερό στην κορυφή όσο κάνει scroll η λίστα - μόνο ο τίτλος μένει
          ακίνητος, τα κουμπιά/η αναζήτηση/το φίλτρο είναι πλέον μέσα στο ListHeaderComponent
          και κυλούν. */}
      <View style={localStyles.titleBand}>
        <Text style={localStyles.sectionTitle}>Προσβάσεις</Text>
      </View>

      {/* style flex:1 τώρα χρειάζεται ρητά: πριν, η λίστα ήταν το μοναδικό ουσιαστικό παιδί
          κάτω από το κενό της κορυφής και έπαιρνε τον υπόλοιπο χώρο από μόνη της· τώρα που ο
          τίτλος είναι σταθερό αδερφικό στοιχείο πριν από αυτήν, χωρίς flex:1 θα συρρικνωνόταν
          στο ύψος του περιεχομένου της. */}
      <FlatList
        style={{ flex: 1 }}
        data={searchedAccessList}
        keyExtractor={(item) => item.doctor_amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
              {/* Δίπλα-δίπλα αντί το ένα κάτω από το άλλο: δύο ίδια γεμάτα κουμπιά σε στοίβα
                  έδειχναν βαριά. Η προσθήκη πρόσβασης έχει τη δική της οθόνη, με την αναζήτηση
                  γιατρού. Τα αιτήματα ανοίγουν το ίδιο παράθυρο όπως πριν, απλώς από κουμπί
                  αντί για το στρογγυλό εικονίδιο. */}
              <View style={localStyles.actionRow}>
                <TouchableOpacity
                  style={[localStyles.actionButton, { flex: 1, marginRight: SPACING.groupGap }]}
                  onPress={() => router.push(ROUTES.PATIENT_ADD_ACCESS)}
                >
                  <Ionicons name="add" size={20} color={COLORS.white} style={{ marginLeft: 10, marginRight: 2 }} />
                  <Text style={[localStyles.actionButtonText, { marginLeft: -8 }]}>Προσθήκη Πρόσβασης</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[localStyles.actionButton, { flex: 1 }]} onPress={openRequestsModal}>
                  <Text style={localStyles.actionButtonText}>{'Αιτήματα\nΓιατρών'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Φιλτράρει μόνο μέσα στους ήδη υπάρχοντες γιατρούς - εμφανίζεται μόνο όταν η
                λίστα είναι αρκετά μεγάλη ώστε να χρειάζεται (βλ. useRecordSearch). */}
            <RecordSearchBar
              label="Αναζήτηση:"
              value={searchQuery}
              onChange={setSearchQuery}
              visible={searchVisible}
            />

            <View style={localStyles.filterWrapper}>
              <TouchableOpacity style={localStyles.sortButton} onPress={() => setIsFilterOpen((prev) => !prev)}>
                <Text style={localStyles.sortButtonText}>{accessFilter}</Text>
                <Ionicons name={isFilterOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.primary} style={{ marginLeft: 8 }} />
              </TouchableOpacity>

              {isFilterOpen && (
                <View style={localStyles.filterDropdown}>
                  {ACCESS_FILTERS.map((option, index) => (
                    <TouchableOpacity
                      key={option}
                      style={[localStyles.filterOption, index < ACCESS_FILTERS.length - 1 && localStyles.filterOptionBorder]}
                      onPress={() => { setAccessFilter(option); setIsFilterOpen(false); }}
                    >
                      <Text style={[localStyles.filterOptionText, option === accessFilter && localStyles.filterOptionTextSelected]}>{option}</Text>
                      {option === accessFilter && <Ionicons name="checkmark" size={16} color={COLORS.primary} style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : accessListError ? (
            <Text style={[styles.emptyText, { marginTop: 50, color: COLORS.danger }]}>{accessListError}</Text>
          ) : searching ? (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν βρέθηκε γιατρός με αυτό το όνομα.</Text>
          ) : (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>
              {accessFilter === ALL_ACCESS
                ? 'Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.'
                : `Κανένας γιατρός δεν έχει "${accessFilter}".`}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <AccessCard
            item={item}
            savingChange={savingChange}
            savedTypeAmkas={savedTypeAmkas}
            deletingAmka={deletingAmka}
            onSelectType={handleSelectAccessType}
            onDelete={handleDeleteAccess}
          />
        )}
      />

      {/* Modal Αιτημάτων Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isRequestsModalVisible} onRequestClose={() => setIsRequestsModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0 }]}>Αιτήματα Πρόσβασης</Text>
              <TouchableOpacity onPress={() => setIsRequestsModalVisible(false)} hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {loadingRequests ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : requests.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 0, marginBottom: 10 }]}>Δεν υπάρχουν εκκρεμή αιτήματα.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {requests.map((item) => (
                  <View key={item.id} style={localStyles.requestCard}>
                    <Text style={localStyles.doctorName}>
                      Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
                    </Text>
                    {!!item.doctors?.specialty && <Text style={localStyles.specialty}>{item.doctors.specialty}</Text>}

                    <Text style={[localStyles.typeLabel, { marginBottom: 6 }]}>Τύπος πρόσβασης:</Text>
                    <Dropdown
                      style={localStyles.typeField}
                      containerStyle={localStyles.typeFieldList}
                      selectedTextStyle={localStyles.typeFieldText}
                      itemTextStyle={localStyles.typeFieldItemText}
                      activeColor={COLORS.lightest}
                      maxHeight={220}
                      data={GRANTABLE_ACCESS_OPTIONS}
                      labelField="label"
                      valueField="value"
                      value={item.access_type}
                      onChange={(option) => handleChangeRequestType(item.id, option.value)}
                      renderRightIcon={() => <Ionicons name="chevron-down" size={18} color={COLORS.primary} />}
                    />

                    <View style={{ flexDirection: 'row', marginTop: 10 }}>
                      <TouchableOpacity
                        style={[localStyles.requestActionButton, { backgroundColor: COLORS.primary, marginRight: 8 }]}
                        onPress={() => handleAcceptRequest(item)}
                        disabled={resolvingRequestId === item.id}
                      >
                        {resolvingRequestId === item.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={localStyles.requestActionButtonText}>Αποδοχή</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[localStyles.requestActionButton, { backgroundColor: COLORS.danger }]}
                        onPress={() => handleRejectRequest(item)}
                        disabled={resolvingRequestId === item.id}
                      >
                        <Text style={localStyles.requestActionButtonText}>Απόρριψη</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Ίδιο μπλε με το historyHeader των υπόλοιπων οθονών, με στρογγυλεμένες κάτω γωνίες.
  titleBand: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10, marginBottom: SPACING.groupGap, paddingTop: 18, paddingBottom: 18, backgroundColor: COLORS.medium, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  sectionTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  // Τα δύο κουμπιά δίπλα-δίπλα κάτω από τον τίτλο, ίδιο σχήμα με τα γεμάτα κουμπιά της εφαρμογής.
  actionRow: { flexDirection: 'row' },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    // Λίγη κάθετη "ανάσα" αντί για σταθερό ύψος: το "Προσθήκη Πρόσβασης" σε μισό πλάτος δεν
    // χωράει πάντα σε μία γραμμή - χρειάζεται να μπορεί να μεγαλώσει σε δύο.
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  actionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText, textAlign: 'center', flexShrink: 1 },
  filterWrapper: { marginHorizontal: SPACING.sideMargin, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap, alignItems: 'center' },
  // Περιγραμμένο αντί για γεμάτο: δευτερεύον στοιχείο της λίστας, όχι τρίτη ενέργεια σαν τα
  // δύο κουμπιά από πάνω. Κεντραρισμένο (alignItems του wrapper) αντί να κολλάει αριστερά.
  sortButton: {
    flexDirection: 'row',
    // Το ίδιο ανοιχτό μπλε με τις κάρτες γιατρών, όχι λευκό - ξεχωρίζει από το φόντο της
    // οθόνης χωρίς να "βαραίνει" σαν τα γεμάτα κουμπιά.
    backgroundColor: COLORS.lightest,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    minHeight: TOUCH.buttonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    paddingHorizontal: 18,
  },
  // Ανοίγει ΚΑΤΩ από το κουμπί, μέσα στη ροή της σελίδας - όχι πια σε Modal, σπρώχνει τις
  // κάρτες από κάτω όπως κάθε άλλο dropdown της εφαρμογής.
  filterDropdown: {
    marginTop: SPACING.groupGap,
    minWidth: 220,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 15,
    overflow: 'hidden',
  },
  filterOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: TOUCH.minTargetSize, paddingHorizontal: 14 },
  filterOptionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.lightest },
  filterOptionText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  filterOptionTextSelected: { color: COLORS.primary, fontWeight: 'bold' },
  sortButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  typeLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  typeField: {
    height: TOUCH.minTargetSize,
    backgroundColor: COLORS.light,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  typeFieldList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.medium,
    backgroundColor: COLORS.white,
  },
  typeFieldText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, fontWeight: '600' },
  typeFieldItemText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  requestCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: 12 },
  requestActionButton: { flex: 1, minHeight: TOUCH.buttonHeight, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  requestActionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText },
});
