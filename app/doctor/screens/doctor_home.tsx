import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { AccessRequestModal } from '../../../components/doctor/AccessRequestModal';
import { SentRequestsModal } from '../../../components/doctor/SentRequestsModal';
import { SPACING, TYPOGRAPHY, TOUCH } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorPatients } from '../../../hooks/useDoctorPatients';
import { fetchDoctorByAmka } from '../../../services/doctors';
import { searchPatients } from '../../../services/patients';

interface SearchResult {
  first_name: string;
  last_name: string;
  amka: string;
}

// Ψάχνουμε μόνο από 3 χαρακτήρες και πάνω - με 1-2 χαρακτήρες η αναζήτηση ταιριάζει σχεδόν με
// τα πάντα και το αποτέλεσμα δεν λέει τίποτα στον γιατρό.
const MIN_SEARCH_LENGTH = 3;

export default function DoctorHomeScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const { patients, loading, error: patientsError } = useDoctorPatients();
  const [doctor, setDoctor] = useState<{ last_name: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [requestAmka, setRequestAmka] = useState('');
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [isSentRequestsModalVisible, setIsSentRequestsModalVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchDoctorByAmka(loggedInDoctorAmka);
        setDoctor(data);
      } catch {
        // Αν αποτύχει, απλά δεν εμφανίζεται το επίθετο στο καλωσόρισμα.
      }
    })();
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Μικρή καθυστέρηση ώστε να μη στέλνουμε ένα query σε κάθε χαρακτήρα που πληκτρολογείται.
    let canceled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await searchPatients(query);
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
  }, [searchQuery]);

  // Πρώτα οι ασθενείς που έχουν ήδη δώσει πρόσβαση (μπαίνεις κατευθείαν στον φάκελο) και μετά
  // οι υπόλοιποι της βάσης, που θέλουν αίτημα. Μέσα σε κάθε ομάδα κρατάμε τη σειρά της βάσης.
  const sortedResults = useMemo(() => {
    const hasAccess = (item: SearchResult) => patients.some((p) => p.amka === item.amka);
    return [...results.filter(hasAccess), ...results.filter((item) => !hasAccess(item))];
  }, [results, patients]);

  const openRequestModal = (amka: string) => {
    setRequestAmka(amka);
    setIsRequestModalVisible(true);
  };

  const renderResultCard = (item: SearchResult) => {
    // Αν ο γιατρός έχει ήδη πρόσβαση, χρησιμοποιούμε την εγγραφή από τη λίστα προσβάσεων -
    // εκεί υπάρχει και ο τύπος πρόσβασης που χρειάζεται η οθόνη ιστορικού.
    const accessiblePatient = patients.find((p) => p.amka === item.amka);

    return (
      <View key={item.amka} style={[sharedStyles.card, { backgroundColor: COLORS.lightest }]}>
        <View style={sharedStyles.cardDetails}>
          <Text style={[sharedStyles.patientName, { color: COLORS.primary }]}>{item.first_name} {item.last_name}</Text>
          <Text style={sharedStyles.cardLabel}>AMKA: <Text style={sharedStyles.cardValue}>{item.amka}</Text></Text>
          {accessiblePatient && (
            <Text style={sharedStyles.cardLabel}>Τύπος πρόσβασης: <Text style={sharedStyles.cardValue}>{accessiblePatient.accessType}</Text></Text>
          )}
        </View>

        {accessiblePatient ? (
          <TouchableOpacity
            style={sharedStyles.cardActionButton}
            onPress={() => router.push({
              pathname: ROUTES.DOCTOR_MED_HISTORY,
              params: {
                amka: accessiblePatient.amka,
                firstName: accessiblePatient.first_name,
                lastName: accessiblePatient.last_name,
                webId: accessiblePatient.webId,
                birthDate: accessiblePatient.birthDate,
                accessType: accessiblePatient.accessType,
              },
            })}
          >
            <Text style={sharedStyles.cardActionButtonText}>Προβολή Φακέλου</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={sharedStyles.cardActionButton} onPress={() => openRequestModal(item.amka)}>
            <Text style={sharedStyles.cardActionButtonText}>Αίτημα Πρόσβασης</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const query = searchQuery.trim();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={localStyles.welcome}>Καλωσορίσατε Δρ. {doctor?.last_name || ''}</Text>
      </View>

      <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.groupGap }}>
        <Text style={styles.dashboardLabel}>Αναζήτηση Ασθενή:</Text>
        <View style={[styles.searchContainer, { marginHorizontal: 0 }]}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Τουλ. 3 χαρακτήρες..."
            placeholderTextColor={COLORS.primary}
            autoCorrect={false}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
        {query.length >= MIN_SEARCH_LENGTH ? (
          searching ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : results.length === 0 ? (
            <Text style={[sharedStyles.emptyText, { marginTop: 20 }]}>Δεν βρέθηκε ασθενής με αυτά τα στοιχεία.</Text>
          ) : (
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {sortedResults.map(renderResultCard)}
            </View>
          )
        ) : (
          /* Χωρίς αναζήτηση δείχνουμε τους ασθενείς που έχουν ήδη δώσει πρόσβαση, όπως και στην
             οθόνη Προσβάσεις - οι ίδιες καρτέλες, ώστε ο γιατρός να μπαίνει κατευθείαν σε φάκελο. */
          <View style={{ paddingHorizontal: SPACING.sideMargin }}>
            <View style={localStyles.accessTitleRow}>
              <Text style={styles.dashboardTitle}>Προσβάσεις</Text>
              <TouchableOpacity
                style={localStyles.circleButton}
                onPress={() => openRequestModal('')}
                accessibilityRole="button"
                accessibilityLabel="Αίτημα πρόσβασης"
              >
                <Ionicons name="add" size={26} color={COLORS.white} />
              </TouchableOpacity>

              <TouchableOpacity
                style={localStyles.circleButton}
                onPress={() => setIsSentRequestsModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Απεσταλμένα αιτήματα"
              >
                <Ionicons name="paper-plane-outline" size={22} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : patientsError ? (
              <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left', color: COLORS.danger }]}>
                Αποτυχία φόρτωσης προσβάσεων: {patientsError}
              </Text>
            ) : patients.length === 0 ? (
              <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν έχετε πρόσβαση σε κανέναν ασθενή.</Text>
            ) : (
              patients.map((patient) => renderResultCard({
                first_name: patient.first_name,
                last_name: patient.last_name,
                amka: patient.amka,
              }))
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: SPACING.sideMargin }}>
          <Text style={styles.dashboardTitle}>Ειδοποιήσεις</Text>
          <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
        </View>
      </ScrollView>

      <SentRequestsModal
        visible={isSentRequestsModalVisible}
        doctorAmka={loggedInDoctorAmka}
        onClose={() => setIsSentRequestsModalVisible(false)}
      />

      <AccessRequestModal
        visible={isRequestModalVisible}
        doctorAmka={loggedInDoctorAmka}
        initialAmka={requestAmka}
        hasAccessTo={(patientAmka) => patients.some((p) => p.amka === patientAmka)}
        onClose={() => setIsRequestModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Το ίδιο κενό που έχει ο τίτλος "Προσβάσεις" και στην οθόνη Προσβάσεων του γιατρού.
  accessTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sectionGap },
  // Στρογγυλό κουμπί στο ελάχιστο επιτρεπτό μέγεθος αφής (48): μικρό δίπλα στον τίτλο, αλλά
  // μέσα στα όρια προσβασιμότητας των κανόνων σχεδίασης.
  circleButton: {
    width: TOUCH.minTargetSize,
    height: TOUCH.minTargetSize,
    borderRadius: TOUCH.minTargetSize / 2,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.groupGap,
  },
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
});
