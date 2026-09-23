import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { loginStyles } from '../../../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { usePatientAccessActions } from '../../../hooks/usePatientAccessActions';
import { fetchDoctorByAmka, searchDoctors } from '../../../services/doctors';
import { addAccess, fetchAccessEntry } from '../../../services/access';
import { hasPendingAccessRequest, resolveAccessRequest } from '../../../services/accessRequests';
import { updatePodAcl } from '../../../services/solidPod';
import { ACCESS_FULL, GRANTABLE_ACCESS_TYPES } from '../../../constants/accessTypes';
import { SelectField } from '../../../components/SelectField';
import { showMessage } from '../../../utils/appMessage';

// Ψάχνουμε μόνο από 3 χαρακτήρες και πάνω - με 1-2 χαρακτήρες η αναζήτηση ταιριάζει σχεδόν με
// τα πάντα και το αποτέλεσμα δεν λέει τίποτα στον ασθενή.
const MIN_SEARCH_LENGTH = 3;

interface DoctorSearchResult {
  first_name: string;
  last_name: string;
  amka: string;
  specialty: string | null;
}

export default function PatientAddAccessScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const { accessList, setAccessList, refresh } = usePatientAccessList();
  // Μόνο το confirmDialog χρειάζεται εδώ - οι υπόλοιπες ενέργειες του hook αφορούν γιατρό που
  // ήδη έχει πρόσβαση, και τέτοιος δεν εμφανίζεται πια σε αυτή την οθόνη.
  const { confirmDialog } = usePatientAccessActions(accessList, setAccessList, refresh);

  const [isAddAccessModalVisible, setIsAddAccessModalVisible] = useState(false);
  const [newDoctorAmka, setNewDoctorAmka] = useState('');
  const [newAccessType, setNewAccessType] = useState(ACCESS_FULL);
  const [addingAccess, setAddingAccess] = useState(false);

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

  // Αυτή η οθόνη είναι για να ΔΟΘΕΙ πρόσβαση σε νέο γιατρό - όποιος έχει ήδη πρόσβαση φαίνεται
  // στη λίστα "Προσβάσεις", όχι εδώ. Χωρίς αυτό το φιλτράρισμα, ο ίδιος γιατρός θα εμφανιζόταν
  // και στις δύο οθόνες, μπερδεύοντας πού ακριβώς αλλάζει κανείς τι.
  const sortedResults = useMemo(
    () => results.filter((item) => !accessList.some((a) => a.doctor_amka === item.amka)),
    [results, accessList]
  );

  // Η προσθήκη γίνεται από το ίδιο παράθυρο με το κουμπί "+", απλώς με συμπληρωμένο ΑΜΚΑ:
  // έτσι περνούν και εδώ όλοι οι έλεγχοι της χειροκίνητης προσθήκης.
  const openAddAccessFor = (doctorAmka: string) => {
    setNewDoctorAmka(doctorAmka);
    setNewAccessType(ACCESS_FULL);
    setIsAddAccessModalVisible(true);
  };

  const handleAddAccess = async () => {
    if (!newDoctorAmka) {
      showMessage("Παρακαλώ εισάγετε το ΑΜΚΑ του γιατρού.");
      return;
    }
    try {
      setAddingAccess(true);

      const { data: doctorData, error: doctorError } = await fetchDoctorByAmka(newDoctorAmka);

      if (doctorError || !doctorData) {
        showMessage("Δεν βρέθηκε γιατρός με αυτό το ΑΜΚΑ.");
        return;
      }

      // Ρωτάμε τη βάση αντί να κοιτάξουμε το accessList: αν είχε αποτύχει η φόρτωσή του, ο
      // έλεγχος θα περνούσε λάθος και θα γραφόταν διπλή εγγραφή πρόσβασης.
      const { data: existingAccess } = await fetchAccessEntry(loggedInPatientAmka, newDoctorAmka);
      if (existingAccess) {
        if (existingAccess.access_type === newAccessType) {
          showMessage("Έχετε ήδη δώσει πρόσβαση σε αυτόν τον γιατρό.");
        } else if (await confirmDialog(
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
        showMessage("Σφάλμα: " + error.message);
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
      showMessage(`Η πρόσβαση στον Δρ. ${doctorData.last_name} δόθηκε επιτυχώς!`);

      // Το αίτημα του γιατρού δεν έχει πια λόγο ύπαρξης.
      if (pendingRequest) {
        await resolveAccessRequest(pendingRequest.id, 'accepted');
      }

      setNewDoctorAmka('');
      setIsAddAccessModalVisible(false);
      refresh();
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setAddingAccess(false);
    }
  };

  // Το sortedResults έχει ήδη αφαιρέσει όποιον έχει πρόσβαση - εδώ μένουν μόνο οι γιατροί
  // στους οποίους μπορεί να δοθεί.
  const renderSearchResultCard = (result: DoctorSearchResult) => {
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

      <View style={localStyles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={localStyles.headerBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={localStyles.headerTitle}>{'Προσθήκη\nΠρόσβασης'}</Text>
      </View>

      <FlatList
        data={sortedResults}
        keyExtractor={(item) => item.amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
            <Text style={localStyles.searchLabel}>Αναζήτηση γιατρού:</Text>
            <View style={localStyles.searchContainer}>
              <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
              <TextInput
                style={localStyles.searchInput}
                placeholder="Τουλ. 3 χαρακτήρες..."
                placeholderTextColor={COLORS.primary}
                autoCorrect={false}
                autoFocus
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
        }
        ListEmptyComponent={
          searching ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
          ) : isSearchActive ? (
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν βρέθηκε γιατρός με αυτά τα στοιχεία.</Text>
          ) : null
        }
        renderItem={({ item }) => renderSearchResultCard(item)}
      />

      {/* Modal Προσθήκης Πρόσβασης */}
      <Modal animationType="slide" transparent={true} visible={isAddAccessModalVisible} onRequestClose={() => setIsAddAccessModalVisible(false)}>
        <View style={styles.addmodalOverlay}>
          <View style={[styles.addmodalContent, { width: '90%' }]}>
            <View style={localStyles.modalTitleRow}>
              <Text style={[styles.addmodalTitle, { marginBottom: 0, color: COLORS.primary }]}>Νέα Πρόσβαση</Text>
              <TouchableOpacity
                style={localStyles.modalClose}
                onPress={() => setIsAddAccessModalVisible(false)}
                hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
                accessibilityRole="button"
                accessibilityLabel="Κλείσιμο"
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={loginStyles.inputLabel}>ΑΜΚΑ Γιατρού</Text>
            {/* Κλειδωμένο: το ΑΜΚΑ έρχεται από τον γιατρό που διάλεξε ο ασθενής στην αναζήτηση.
                Αν άλλαζε εδώ, η πρόσβαση θα πήγαινε σε άλλον γιατρό από αυτόν που είδε. */}
            <TextInput
              style={[loginStyles.loginInput, localStyles.lockedInput]}
              value={newDoctorAmka}
              editable={false}
            />

            {/* Ίδια κλειστή λίστα με το αίτημα του γιατρού: ο τύπος πρόσβασης γράφεται με τα
                ίδια ακριβώς λόγια και από τις δύο μεριές, αλλιώς δύο διαφορετικά κείμενα θα
                σήμαιναν το ίδιο δικαίωμα. */}
            <SelectField
              label="Τύπος Πρόσβασης"
              inputStyle={localStyles.modalSelect}
              value={newAccessType}
              onChange={setNewAccessType}
              options={GRANTABLE_ACCESS_TYPES}
            />

            <TouchableOpacity style={[localStyles.grantButton, { marginTop: 0 }]} onPress={handleAddAccess} disabled={addingAccess}>
              {addingAccess ? <ActivityIndicator color={COLORS.white} /> : <Text style={localStyles.grantButtonText}>Εντάξει</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Ο τίτλος σε δύο γραμμές είναι αρκετά στενός ώστε το κεντράρισμα να μην ακουμπάει πια το
  // βέλος επιστροφής - αυτό μένει σταθερό στα αριστερά με απόλυτη θέση.
  // Ίδιο ανοιχτό μπλε φόντο με το historyHeader των υπόλοιπων οθονών: ξεχωρίζει τον τίτλο από
  // την αναζήτηση/τη λίστα από κάτω, και μένει σταθερό στην κορυφή όσο κάνει scroll το FlatList.
  headerRow: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10, marginBottom: SPACING.groupGap, paddingTop: 18, paddingBottom: 18, backgroundColor: COLORS.medium, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerBackButton: { position: 'absolute', left: SPACING.sideMargin, top: 0, bottom: 0, justifyContent: 'center' },
  headerTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  searchLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, paddingHorizontal: 15, marginBottom: SPACING.sectionGap, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  resultAmka: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginBottom: SPACING.groupGap },
  // Ίδιο σχήμα με το κουμπί κατάργησης, στο χρώμα της εφαρμογής: η μία ενέργεια δίνει, η άλλη αφαιρεί.
  grantButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  grantButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  modalSelect: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.medium, borderRadius: 20 },
  // Κλειδωμένο πεδίο: το φόντο δείχνει ότι δεν πληκτρολογείται, ενώ το κείμενο μένει μαύρο
  // ώστε το ΑΜΚΑ να διαβάζεται κανονικά.
  lockedInput: { backgroundColor: COLORS.light, color: COLORS.text },
  modalTitleRow: { justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  modalClose: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' },
});
