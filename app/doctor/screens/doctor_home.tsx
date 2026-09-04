import React, { useEffect, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { AccessRequestModal } from '../../../components/doctor/AccessRequestModal';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
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
  const { patients } = useDoctorPatients();
  const [doctor, setDoctor] = useState<{ last_name: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const [requestAmka, setRequestAmka] = useState('');
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);

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
            placeholder="Αναζήτηση..."
            placeholderTextColor={COLORS.primary}
            autoCorrect={false}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
        {query.length >= MIN_SEARCH_LENGTH && (
          searching ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : results.length === 0 ? (
            <Text style={[sharedStyles.emptyText, { marginTop: 20 }]}>Δεν βρέθηκε ασθενής με αυτά τα στοιχεία.</Text>
          ) : (
            <View style={{ paddingHorizontal: SPACING.sideMargin }}>
              {results.map(renderResultCard)}
            </View>
          )
        )}

        <View style={{ paddingHorizontal: SPACING.sideMargin }}>
          <Text style={styles.dashboardTitle}>Ειδοποιήσεις</Text>
          <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
        </View>
      </ScrollView>

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
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
});
