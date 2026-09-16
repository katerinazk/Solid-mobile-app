import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, FlatList, ScrollView, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Alert, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { fetchDoctorByAmka, searchDoctors } from '../../../services/doctors';
import { addAccess, deleteAccess, updateAccessType, fetchAccessEntry } from '../../../services/access';
import { fetchPendingAccessRequestsForPatient, resolveAccessRequest, hasPendingAccessRequest } from '../../../services/accessRequests';
import { updatePodAcl, removeDoctorFromAcl } from '../../../services/solidPod';
import { Dropdown } from 'react-native-element-dropdown';
import { PatientHeader } from '../../../components/patient/PatientHeader';
import { ACCESS_FULL, ACCESS_READ_ONLY, ACCESS_NONE, ACCESS_TYPES, GRANTABLE_ACCESS_TYPES } from '../../../constants/accessTypes';

// Ψάχνουμε μόνο από 3 χαρακτήρες και πάνω - με 1-2 χαρακτήρες η αναζήτηση ταιριάζει σχεδόν με
// τα πάντα και το αποτέλεσμα δεν λέει τίποτα στον ασθενή.
const MIN_SEARCH_LENGTH = 3;

// Οι επιλογές του φίλτρου. Η πρώτη είναι η "χωρίς φίλτρο", ώστε να υπάρχει δρόμος πίσω.
const ALL_ACCESS = 'Όλες οι προσβάσεις';
const ACCESS_FILTERS = [ALL_ACCESS, ...ACCESS_TYPES];

// Η βιβλιοθήκη του dropdown θέλει αντικείμενα με ετικέτα και τιμή, όχι σκέτες συμβολοσειρές.
const ACCESS_TYPE_OPTIONS = ACCESS_TYPES.map((type) => ({ label: type, value: type }));
const GRANTABLE_ACCESS_OPTIONS = GRANTABLE_ACCESS_TYPES.map((type) => ({ label: type, value: type }));


interface DoctorSearchResult {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string | null;
}

interface AccessRequest {
  id: string;
  doctor_amka: string;
  access_type: string;
  doctors: { first_name: string; last_name: string; specialty: string | null; web_id: string | null } | null;
}

export default function PatientAccessScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const { accessList, setAccessList, loading, setLoading, refresh } = usePatientAccessList();

  const [isAddAccessModalVisible, setIsAddAccessModalVisible] = useState(false);
  const [newDoctorAmka, setNewDoctorAmka] = useState('');
  const [newAccessType, setNewAccessType] = useState(ACCESS_FULL);


  // Οπτική επιβεβαίωση της αλλαγής: πρώτα δείχνει ότι αποθηκεύεται, μετά ότι ολοκληρώθηκε.
  // Χωρίς αυτό η αλλαγή γινόταν σιωπηλά και ο ασθενής δεν ήξερε αν καταγράφηκε.
  //
  // Κρατάμε λίστα και όχι έναν γιατρό: αλλάζοντας δεύτερο, η επιβεβαίωση του πρώτου δεν
  // πρέπει να σβήσει, γιατί θα διαβαζόταν σαν να αναιρέθηκε η αλλαγή του.
  const [savingChange, setSavingChange] = useState<{ amka: string; type: string } | null>(null);
  const [savedTypeAmkas, setSavedTypeAmkas] = useState<string[]>([]);

  // Οι επιβεβαιώσεις μένουν όσο ο ασθενής βρίσκεται στην οθόνη και καθαρίζουν μόλις τη
  // αφήσει, ώστε επιστρέφοντας αργότερα να μη βλέπει παλιά πράσινα.
  useFocusEffect(useCallback(() => () => setSavedTypeAmkas([]), []));

  const [accessFilter, setAccessFilter] = useState(ALL_ACCESS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const visibleAccessList = useMemo(
    () => accessFilter === ALL_ACCESS ? accessList : accessList.filter((a) => a.access_type === accessFilter),
    [accessList, accessFilter]
  );

  // Η αναζήτηση πηγαίνει σε ΟΛΟΥΣ τους γιατρούς της βάσης, όχι μόνο σε όσους έχει ήδη δώσει
  // πρόσβαση ο ασθενής: αλλιώς δεν θα μπορούσε ποτέ να βρει καινούργιο γιατρό με το όνομά του.
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DoctorSearchResult[]>([]);

  const trimmedQuery = searchQuery.trim();
  const isSearchActive = trimmedQuery.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    if (!isSearchActive) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Μικρή καθυστέρηση ώστε να μη στέλνουμε ένα query σε κάθε χαρακτήρα που πληκτρολογείται.
    let canceled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await searchDoctors(trimmedQuery);
        if (canceled) return;
        setResults(error ? [] : ((data || []) as DoctorSearchResult[]));
      } finally {
        if (!canceled) setSearching(false);
      }
    }, 300);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, isSearchActive]);

  // Πρώτα οι γιατροί που έχουν ήδη πρόσβαση, ώστε ο ασθενής να βλέπει αμέσως τι ισχύει, και
  // μετά οι υπόλοιποι της βάσης, που περιμένουν να τους δοθεί.
  const sortedResults = useMemo(() => {
    const hasAccess = (item: DoctorSearchResult) => accessList.some((a) => a.doctor_amka === item.amka);
    return [...results.filter(hasAccess), ...results.filter((item) => !hasAccess(item))];
  }, [results, accessList]);

  // Η προσθήκη γίνεται από το ίδιο παράθυρο με το κουμπί "+", απλώς με συμπληρωμένο ΑΜΚΑ:
  // έτσι περνούν και εδώ όλοι οι έλεγχοι της χειροκίνητης προσθήκης.
  const openAddAccessFor = (doctorAmka: string) => {
    setNewDoctorAmka(doctorAmka);
    setNewAccessType(ACCESS_FULL);
    setIsAddAccessModalVisible(true);
  };

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
        alert("Σφάλμα φόρτωσης αιτημάτων: " + error.message);
        return;
      }
      setRequests((data || []) as unknown as AccessRequest[]);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Ο γιατρός έχει ήδη πρόσβαση αλλά με άλλον τύπο: αντί για σκέτη άρνηση, ρωτάμε τον ασθενή
  // αν θέλει να την αλλάξει. Επιστρέφει true αν έγινε η αλλαγή.
  // Το Alert.alert δεν επιστρέφει την απάντηση, οπότε το τυλίγουμε σε Promise ώστε η ροή να
  // μπορεί να την περιμένει αντί να συνεχίσει πριν καν εμφανιστεί το παράθυρο.
  const confirmDialog = (title: string, message: string): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: "Όχι", style: "cancel", onPress: () => resolve(false) },
          { text: "Ναι", onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });

  /**
   * Γράφει τον νέο τύπο στη βάση και ευθυγραμμίζει το ACL του Pod.
   *
   * Το "Καμία Πρόσβαση" βγάζει τον γιατρό από το ACL και κατεβάζει το acl_synced, χωρίς όμως
   * να σβήσει την εγγραφή του: ο ασθενής τον κρατά στη λίστα του για το μέλλον, ενώ ο γιατρός
   * παύει να βλέπει και τον φάκελο και τον ίδιο τον ασθενή στη δική του λίστα.
   */
  const applyAccessType = async (doctorAmka: string, doctorWebId: string | null | undefined, newType: string): Promise<boolean> => {
    const revoking = newType === ACCESS_NONE;

    const { error } = await updateAccessType(loggedInPatientAmka, doctorAmka, newType, revoking ? false : !!doctorWebId);
    if (error) {
      alert("Σφάλμα: " + error.message);
      return false;
    }

    // Χωρίς WebID ο γιατρός δεν βρίσκεται καν στο ACL - δεν υπάρχει τίποτα να γραφτεί.
    if (doctorWebId) {
      if (revoking) {
        await removeDoctorFromAcl({ activePatientFolderUrl, accessToken, accessList, doctorWebId });
      } else {
        await updatePodAcl({
          activePatientFolderUrl,
          accessToken,
          accessList,
          newDoctorWebId: doctorWebId,
          accessType: newType,
        });
      }
    }

    return true;
  };

  // Για γιατρό που έχει ΗΔΗ πρόσβαση: ρωτάμε και, αν συμφωνήσει ο ασθενής, αλλάζουμε τον τύπο.
  const confirmChangeAccessType = async (doctorAmka: string, doctorWebId: string | null, newType: string, title: string, message: string): Promise<boolean> => {
    if (!(await confirmDialog(title, message))) return false;
    if (!(await applyAccessType(doctorAmka, doctorWebId, newType))) return false;

    refresh();
    alert("Ο τύπος πρόσβασης άλλαξε επιτυχώς!");
    return true;
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
          alert("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        }
        // Είτε άλλαξε ο τύπος είτε όχι, ο γιατρός έχει πρόσβαση - το αίτημα δεν έχει λόγο να μείνει.
        await resolveAccessRequest(request.id, 'accepted');
        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        return;
      }

      const { error } = await addAccess(loggedInPatientAmka, request.doctor_amka, request.access_type, !!request.doctors?.web_id);
      if (error) {
        alert("Σφάλμα: " + error.message);
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
      alert(`Η πρόσβαση στον Δρ. ${request.doctors?.last_name || ''} δόθηκε επιτυχώς!`);
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
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
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setResolvingRequestId(null);
    }
  };

  const handleAddAccess = async () => {
    if (!newDoctorAmka) {
      alert("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setLoading(true);

      const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(newDoctorAmka);

      if (doctorError || !doctorData) {
        alert("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      // Ρωτάμε τη βάση αντί να κοιτάξουμε το accessList: αν είχε αποτύχει η φόρτωσή του, ο
      // έλεγχος θα περνούσε λάθος και θα γραφόταν διπλή εγγραφή πρόσβασης.
      const { data: existingAccess } = await fetchAccessEntry(loggedInPatientAmka, newDoctorAmka);
      if (existingAccess) {
        if (existingAccess.access_type === newAccessType) {
          alert("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        } else if (await confirmChangeAccessType(
          newDoctorAmka,
          doctorData.web_id,
          newAccessType,
          "Υπάρχει ήδη πρόσβαση",
          `Έχετε ήδη δώσει "${existingAccess.access_type}" σε αυτόν τον γιατρό. Θέλετε να την αλλάξετε σε "${newAccessType}";`,
        )) {
          setNewDoctorAmka('');
          setIsAddAccessModalVisible(false);
        }
        return;
      }

      // Ελέγχουμε το εκκρεμές αίτημα ΠΡΙΝ δοθεί η πρόσβαση, ώστε να γραφτεί κατευθείαν ο τύπος
      // που θα ισχύσει - αλλιώς θα δίναμε τον έναν και θα τον αλλάζαμε αμέσως μετά.
      const { data: pendingRequest } = await hasPendingAccessRequest(newDoctorAmka, loggedInPatientAmka);
      let effectiveType = newAccessType;

      if (pendingRequest && pendingRequest.access_type !== newAccessType) {
        const useRequestedType = await confirmDialog(
          "Αίτημα του γιατρού",
          `Ο Δρ. ${doctorData.last_name} είχε ζητήσει "${pendingRequest.access_type}". Θέλετε να του δώσετε "${pendingRequest.access_type}" αντί για "${newAccessType}";`,
        );
        if (useRequestedType) effectiveType = pendingRequest.access_type;
      }

      const { error } = await addAccess(loggedInPatientAmka, newDoctorAmka, effectiveType, !!doctorData.web_id);

      if (error) {
        alert("Σφάλμα: " + error.message);
        return;
      }

      // Αν ο γιατρός δεν έχει ακόμα WebID (δεν έχει κάνει ποτέ Solid login), η πρόσβαση
      // καταχωρείται κανονικά στη βάση και μπαίνει στο ACL με τον επόμενο συγχρονισμό.
      if (doctorData.web_id) {
        await updatePodAcl({
          activePatientFolderUrl,
          accessToken,
          accessList,
          newDoctorWebId: doctorData.web_id,
          accessType: effectiveType,
        });
      }
      alert(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);

      // Το αίτημα του γιατρού δεν έχει πια λόγο ύπαρξης - φεύγει από τα "Αιτήματα".
      if (pendingRequest) {
        await resolveAccessRequest(pendingRequest.id, 'accepted');
        setRequests((prev) => prev.filter((r) => r.id !== pendingRequest.id));
      }

      setNewDoctorAmka('');
      setIsAddAccessModalVisible(false);
      refresh();
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccess = async (doctorAmka: string) => {
    Alert.alert("Κατάργηση", "Θέλετε να αφαιρέσετε αυτή την πρόσβαση;", [
      { text: "Ακύρωση", style: "cancel" },
      {
        text: "Κατάργηση",
        style: "destructive",
        onPress: async () => {
          const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
          const doctorWebId = doctorEntry?.doctors?.web_id;
          const { error } = await deleteAccess(loggedInPatientAmka, doctorAmka);

          if (!error) {
            if (doctorWebId) {
              await removeDoctorFromAcl({
                activePatientFolderUrl,
                accessToken,
                accessList,
                doctorWebId,
              });
            }
            setAccessList(prev => prev.filter(a => a.doctor_amka !== doctorAmka));
            alert("Η πρόσβαση καταργήθηκε επιτυχώς!");
          }
        }
      }
    ]);
  };

  const handleSelectAccessType = async (doctorAmka: string, newType: string) => {
    const doctorEntry = accessList.find(a => a.doctor_amka === doctorAmka);
    if (doctorEntry?.access_type === newType) return;

    setSavingChange({ amka: doctorAmka, type: newType });
    setSavedTypeAmkas(prev => prev.filter(amka => amka !== doctorAmka));

    const saved = await applyAccessType(doctorAmka, doctorEntry?.doctors?.web_id, newType);
    setSavingChange(null);
    if (!saved) return;

    setAccessList(prev => prev.map(a =>
      a.doctor_amka === doctorAmka ? { ...a, access_type: newType } : a
    ));

    setSavedTypeAmkas(prev => [...prev, doctorAmka]);
  };

  // Η καρτέλα ενός γιατρού που έχει ήδη πρόσβαση. Είναι ξεχωριστή συνάρτηση επειδή
  // εμφανίζεται σε δύο σημεία: στη λίστα προσβάσεων και μέσα στα αποτελέσματα αναζήτησης.
  const renderAccessCard = (item: any) => (
          <View style={localStyles.card}>
            <Text style={localStyles.doctorName}>
              Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
            </Text>
            <Text style={localStyles.specialty}>{item.doctors?.specialty}</Text>

            <View style={localStyles.typeRow}>
              <Text style={localStyles.typeLabel}>Τύπος πρόσβασης:</Text>

              <Dropdown
                style={[localStyles.typeField, savedTypeAmkas.includes(item.doctor_amka) && localStyles.typeFieldSaved]}
                containerStyle={localStyles.typeFieldList}
                selectedTextStyle={[localStyles.typeFieldText, savedTypeAmkas.includes(item.doctor_amka) && localStyles.typeFieldTextSaved]}
                itemTextStyle={localStyles.typeFieldItemText}
                selectedTextProps={{ numberOfLines: 1 }}
                activeColor={COLORS.lightest}
                maxHeight={220}
                data={ACCESS_TYPE_OPTIONS}
                labelField="label"
                valueField="value"
                value={item.access_type}
                disable={!!savingChange}
                onChange={(option) => handleSelectAccessType(item.doctor_amka, option.value)}
                renderRightIcon={() =>
                  savingChange?.amka === item.doctor_amka ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : savedTypeAmkas.includes(item.doctor_amka) ? (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
                  ) : (
                    <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
                  )
                }
              />
            </View>

            {savingChange?.amka === item.doctor_amka && (
              <Text style={localStyles.statusText}>Αποθήκευση αλλαγής...</Text>
            )}
            {savedTypeAmkas.includes(item.doctor_amka) && (
              <Text style={[localStyles.statusText, { color: COLORS.success, fontWeight: 'bold' }]}>Η αλλαγή αποθηκεύτηκε</Text>
            )}

            <TouchableOpacity style={localStyles.removeButton} onPress={() => handleDeleteAccess(item.doctor_amka)}>
              <Text style={localStyles.removeButtonText}>Κατάργηση</Text>
            </TouchableOpacity>
          </View>
  );

  // Το αποτέλεσμα αναζήτησης: αν ο γιατρός έχει ήδη πρόσβαση δείχνουμε την κανονική του
  // καρτέλα, ώστε ο ασθενής να αλλάζει τον τύπο επιτόπου αντί να ψάχνει πάλι τη λίστα.
  const renderSearchResultCard = (result: DoctorSearchResult) => {
    const existing = accessList.find((a) => a.doctor_amka === result.amka);
    if (existing) return renderAccessCard(existing);

    return (
      <View style={localStyles.card}>
        <Text style={localStyles.doctorName}>Δρ. {result.last_name} {result.first_name}</Text>
        {!!result.specialty && <Text style={localStyles.specialty}>{result.specialty}</Text>}
        <Text style={localStyles.resultAmka}>ΑΜΚΑ: {result.amka}</Text>
        <TouchableOpacity style={localStyles.grantButton} onPress={() => openAddAccessFor(result.amka)}>
          <Text style={localStyles.grantButtonText}>Προσθήκη Πρόσβασης</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <FlatList
        data={isSearchActive ? sortedResults : visibleAccessList}
        keyExtractor={(item) => item.doctor_amka || item.amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        ListHeaderComponent={
          <>
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {/* Οι δύο ενέργειες της οθόνης ζουν δίπλα στον τίτλο, ως στρογγυλά εικονίδια:
                  δίνω πρόσβαση σε γιατρό, και βλέπω ποιοι μου την έχουν ζητήσει. */}
              <View style={localStyles.titleRow}>
                <Text style={localStyles.sectionTitle}>Προσβάσεις</Text>
                <TouchableOpacity
                  style={localStyles.circleButton}
                  onPress={() => setIsAddAccessModalVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Προσθήκη πρόσβασης σε γιατρό"
                >
                  <Ionicons name="add" size={26} color={COLORS.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={localStyles.circleButton}
                  onPress={openRequestsModal}
                  accessibilityRole="button"
                  accessibilityLabel="Αιτήματα πρόσβασης από γιατρούς"
                >
                  <Ionicons name="mail-unread-outline" size={22} color={COLORS.white} />
                </TouchableOpacity>
              </View>

              <View style={{ width: '70%', alignSelf: 'center' }}>
                <Text style={localStyles.searchLabel}>Αναζήτηση γιατρού:</Text>
                <View style={[localStyles.searchContainer, { marginHorizontal: 0 }]}>
                  <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
                  <TextInput
                    style={localStyles.searchInput}
                    placeholder="Όνομα, επώνυμο ή ΑΜΚΑ"
                    placeholderTextColor={COLORS.primary}
                    autoCorrect={false}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {!!searchQuery && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
                      accessibilityRole="button"
                      accessibilityLabel="Καθαρισμός αναζήτησης"
                    >
                      <Ionicons name="close-circle" size={20} color={COLORS.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Το φίλτρο ανοίγει προς τα κάτω σπρώχνοντας τη λίστα, αντί να επιπλέει από πάνω
                της: μέσα σε κεφαλίδα FlatList ένα επιπλέον στοιχείο κόβεται στα άκρα.
                Κατά την αναζήτηση κρύβεται: τα αποτελέσματα περιλαμβάνουν και γιατρούς χωρίς
                καμία πρόσβαση, που δεν έχουν τύπο για να φιλτραριστούν. */}
            {!isSearchActive && (
            <View style={localStyles.filterWrapper}>
              <TouchableOpacity style={localStyles.sortButton} onPress={() => setIsFilterOpen((prev) => !prev)}>
                <Text style={localStyles.sortButtonText}>↕  {accessFilter}</Text>
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
            )}
          </>
        }
        ListEmptyComponent={
          (loading && !isSearchActive) || (isSearchActive && searching) ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : isSearchActive ? (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν βρέθηκε γιατρός με αυτά τα στοιχεία.</Text>
          ) : (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>
              {accessFilter === ALL_ACCESS
                ? 'Δεν έχετε δώσει πρόσβαση σε κανέναν γιατρό.'
                : `Κανένας γιατρός δεν έχει "${accessFilter}".`}
            </Text>
          )
        }
        renderItem={({ item }) => isSearchActive ? renderSearchResultCard(item) : renderAccessCard(item)}
      />

      {/* Modal Προσθήκης Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isAddAccessModalVisible} onRequestClose={() => setIsAddAccessModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={styles.addmodalContent}>
            <Text style={styles.addmodalTitle}>Νέα Πρόσβαση</Text>

            <Text style={loginStyles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
            <TextInput
              style={loginStyles.loginInput}
              placeholder="11 ψηφία"
              keyboardType="numeric"
              value={newDoctorAmka}
              onChangeText={setNewDoctorAmka}
            />

            <Text style={loginStyles.inputLabel}>Τύπος Πρόσβασης</Text>
            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginRight: 5, backgroundColor: newAccessType === ACCESS_FULL ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType(ACCESS_FULL)}
              >
                <Text style={{ color: newAccessType === ACCESS_FULL ? COLORS.white : COLORS.text, textAlign: 'center' }}>Πλήρης</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { flex: 1, marginLeft: 5, backgroundColor: newAccessType === ACCESS_READ_ONLY ? COLORS.primary : COLORS.lightest, borderWidth: 1, borderColor: COLORS.medium }]}
                onPress={() => setNewAccessType(ACCESS_READ_ONLY)}
              >
                <Text style={{ color: newAccessType === ACCESS_READ_ONLY ? COLORS.white : COLORS.text, textAlign: 'center' }}>Μόνο Ανάγνωση</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsGroup}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsAddAccessModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Ακύρωση</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleAddAccess} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Εντάξει</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  // Ίδια στοίχιση με την αρχική του γιατρού: τα κουμπιά κάθονται ακριβώς δίπλα στον τίτλο,
  // όχι στην άκρη της οθόνης.
  sectionTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: 10, marginBottom: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sectionGap },
  // Στρογγυλό κουμπί στο ελάχιστο επιτρεπτό μέγεθος αφής (48).
  circleButton: {
    width: TOUCH.minTargetSize,
    height: TOUCH.minTargetSize,
    borderRadius: TOUCH.minTargetSize / 2,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.groupGap,
  },
  searchLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, marginHorizontal: SPACING.sideMargin, paddingHorizontal: 15, marginBottom: SPACING.sectionGap, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  filterWrapper: { marginHorizontal: SPACING.sideMargin, marginBottom: SPACING.sectionGap },
  sortButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, justifyContent: 'center', alignItems: 'center', borderRadius: 25 },
  filterDropdown: {
    marginTop: SPACING.groupGap,
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
  sortButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  typeLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  // Το πεδίο επιλογής είναι γεμάτο κουμπί, στο χρώμα της εφαρμογής. Μόλις αποθηκευτεί μια
  // αλλαγή, γεμίζει πράσινο: η επιβεβαίωση φαίνεται από απόσταση, όχι σε μια λεπτή γραμμή.
  typeRow: { flexDirection: 'row', alignItems: 'center' },
  typeField: {
    // Πιάνει ό,τι περισσεύει δεξιά από την ετικέτα. Το ύψος πέφτει στο ελάχιστο που
    // επιτρέπουν οι κανόνες για στόχο αφής - πιο κάτω δεν γίνεται.
    flex: 1,
    marginLeft: SPACING.groupGap,
    height: TOUCH.minTargetSize,
    backgroundColor: COLORS.light,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  typeFieldSaved: { backgroundColor: COLORS.success },
  typeFieldText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, fontWeight: '600' },
  typeFieldTextSaved: { color: COLORS.white },
  // Η λίστα που ανοίγει χρειάζεται δικό της φόντο και περίγραμμα: επιπλέει πάνω από την καρτέλα.
  typeFieldList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.medium,
    backgroundColor: COLORS.white,
  },
  typeFieldItemText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  statusText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 6 },
  removeButton: { backgroundColor: COLORS.danger, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  removeButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  resultAmka: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginBottom: SPACING.groupGap },
  // Ίδιο σχήμα με το κουμπί κατάργησης, στο χρώμα της εφαρμογής: η μία ενέργεια δίνει, η άλλη αφαιρεί.
  grantButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  grantButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  requestCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 15, padding: 14, marginBottom: 12 },
  requestActionButton: { flex: 1, minHeight: TOUCH.buttonHeight, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  requestActionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText },
});
