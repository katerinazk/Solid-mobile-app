import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { AccessRequestModal } from '../../../components/doctor/AccessRequestModal';
import { searchPatients } from '../../../services/patients';
import { fetchPendingAccessRequestsForDoctor } from '../../../services/accessRequests';

// Ψάχνουμε μόνο από 3 χαρακτήρες και πάνω - με 1-2 χαρακτήρες η αναζήτηση ταιριάζει σχεδόν με
// τα πάντα και το αποτέλεσμα δεν λέει τίποτα στον γιατρό.
const MIN_SEARCH_LENGTH = 3;

interface SearchResult {
  first_name: string;
  last_name: string;
  amka: string;
}

// Το αίτημα πρόσβασης προς νέο ασθενή, σε δική του οθόνη - πριν ζούσε μέσα στην αρχική, ανάμιξη
// με τη λίστα όσων έχει ήδη πρόσβαση ο γιατρός. Η αναζήτηση εδώ πιάνει ΟΛΗ τη βάση ασθενών.
export default function DoctorAddAccessScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const { patients } = useDoctorPatients();

  const [requestAmka, setRequestAmka] = useState('');
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);

  // Τα ΑΜΚΑ των ασθενών που έχουν ήδη λάβει αίτημα και δεν το έχουν απαντήσει ακόμα - στις
  // καρτέλες τους δείχνουμε ενημέρωση αντί για κουμπί, ώστε να μη σταλεί δεύτερο αίτημα.
  const [pendingRequestAmkas, setPendingRequestAmkas] = useState<string[]>([]);

  const loadPendingRequests = async () => {
    try {
      const { data, error } = await fetchPendingAccessRequestsForDoctor(loggedInDoctorAmka);
      if (error) return;
      setPendingRequestAmkas(((data || []) as any[]).map((r) => r.patient_amka));
    } catch {
      // Αν αποτύχει, οι καρτέλες απλώς δείχνουν κανονικά το κουμπί αιτήματος.
    }
  };

  useEffect(() => {
    loadPendingRequests();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

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
        const { data, error } = await searchPatients(trimmedQuery);
        if (canceled) return;
        setResults(error ? [] : ((data || []) as SearchResult[]));
      } finally {
        if (!canceled) setSearching(false);
      }
    }, 300);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery, isSearchActive]);

  // Αυτή η οθόνη είναι για να ζητηθεί πρόσβαση σε ΝΕΟ ασθενή - όποιος έχει ήδη πρόσβαση
  // φαίνεται στην αρχική, όχι εδώ. Χωρίς αυτό το φιλτράρισμα, ο ίδιος ασθενής θα εμφανιζόταν
  // και στις δύο οθόνες, μπερδεύοντας πού ακριβώς αλλάζει κανείς τι.
  const sortedResults = useMemo(
    () => results.filter((item) => !patients.some((p) => p.amka === item.amka)),
    [results, patients]
  );

  const openRequestModal = (amka: string) => {
    setRequestAmka(amka);
    setIsRequestModalVisible(true);
  };

  // Το sortedResults έχει ήδη αφαιρέσει όποιον έχει πρόσβαση - εδώ μένουν μόνο οι ασθενείς
  // στους οποίους μπορεί να σταλεί αίτημα.
  const renderSearchResultCard = (item: SearchResult) => (
    <View key={item.amka} style={localStyles.card}>
      <Text style={localStyles.patientName}>{item.first_name} {item.last_name}</Text>
      <Text style={localStyles.resultAmka}>ΑΜΚΑ: {item.amka}</Text>

      {pendingRequestAmkas.includes(item.amka) ? (
        <Text style={localStyles.pendingRequestText}>Έχει σταλεί αίτημα πρόσβασης</Text>
      ) : (
        <TouchableOpacity style={localStyles.actionButton} onPress={() => openRequestModal(item.amka)}>
          <Text style={localStyles.actionButtonText}>Αίτημα Πρόσβασης</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={localStyles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={localStyles.headerBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={localStyles.headerTitle}>{'Αίτημα\nΠρόσβασης'}</Text>
      </View>

      <FlatList
        data={sortedResults}
        keyExtractor={(item) => item.amka}
        contentContainerStyle={{ paddingBottom: SPACING.bottomMargin, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
            <Text style={localStyles.searchLabel}>Αναζήτηση ασθενή:</Text>
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
            <Text style={[styles.emptyText, { marginTop: 50 }]}>Δεν βρέθηκε ασθενής με αυτά τα στοιχεία.</Text>
          ) : null
        }
        renderItem={({ item }) => renderSearchResultCard(item)}
      />

      <AccessRequestModal
        visible={isRequestModalVisible}
        doctorAmka={loggedInDoctorAmka}
        initialAmka={requestAmka}
        hasAccessTo={(patientAmka) => patients.some((p) => p.amka === patientAmka)}
        onClose={() => setIsRequestModalVisible(false)}
        onSubmitted={loadPendingRequests}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Ίδιο ανοιχτό μπλε φόντο με το historyHeader των υπόλοιπων οθονών.
  headerRow: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10, marginBottom: SPACING.groupGap, paddingTop: 18, paddingBottom: 18, backgroundColor: COLORS.medium, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerBackButton: { position: 'absolute', left: SPACING.sideMargin, top: 0, bottom: 0, justifyContent: 'center' },
  headerTitle: { fontSize: TYPOGRAPHY.mainTitle, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  searchLabel: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.lightest, borderRadius: 25, paddingHorizontal: 15, marginBottom: SPACING.sectionGap, borderWidth: 1, borderColor: COLORS.medium },
  searchInput: { flex: 1, height: 40, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  patientName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  resultAmka: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginTop: 2, marginBottom: SPACING.groupGap },
  actionButton: { backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  actionButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  pendingRequestText: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600', color: COLORS.primary, textAlign: 'center', marginTop: SPACING.groupGap },
});
