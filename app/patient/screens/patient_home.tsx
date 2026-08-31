import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { PatientHeader } from '../../../components/patient/PatientHeader';
import { fetchPatientByAmka } from '../../../services/patients';

// Προς το παρόν όλες οι κατηγορίες δείχνουν 0 εγγραφές - θα συνδεθούν με το Pod του ασθενή
// (πλήθος αρχείων ανά φάκελο) σε επόμενο βήμα.
const CATEGORIES = [
  { label: 'Εξετάσεις', count: 0 },
  { label: 'Φάρμακα', count: 0 },
  { label: 'Αλλεργίες', count: 0 },
  { label: 'Διαγνώσεις', count: 0 },
  { label: 'Νοσηλίες', count: 0 },
  { label: 'Εμβολιασμοί', count: 0 },
];

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export default function PatientHomeScreen() {
  const { loggedInPatientAmka } = useAuth();
  const [patient, setPatient] = useState<{ last_name: string; sex: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchPatientByAmka(loggedInPatientAmka);
        setPatient(data);
      } catch {
        // Αν αποτύχει, απλά δεν εμφανίζεται το επίθετο στο καλωσόρισμα.
      }
    })();
  }, []);

  const salutation = patient?.sex?.trim().toLowerCase().startsWith('γυναίκ') ? 'κυρία' : 'κύριε';
  const rows = chunkPairs(CATEGORIES);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <Text style={localStyles.welcome}>Καλωσωρίσατε {salutation} {patient?.last_name || ''}</Text>

        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => router.push(ROUTES.PATIENT_ACCESS)}>
          <Text style={styles.addButtonText}>Διαχείριση Προσβάσεων</Text>
        </TouchableOpacity>

        <Text style={localStyles.sectionTitle}>Ιστορικό</Text>
        {rows.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', marginBottom: SPACING.groupGap }}>
            {row.map((category, i) => (
              <TouchableOpacity
                key={category.label}
                style={[localStyles.categoryButton, i === 0 && row.length === 2 ? { marginRight: SPACING.groupGap } : null]}
              >
                <Text style={localStyles.categoryButtonText}>{category.label} ({category.count})</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <Text style={localStyles.sectionTitle}>Ειδοποιήσεις</Text>
        <Text style={[styles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
  sectionTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.sectionGap, marginBottom: SPACING.groupGap },
  categoryButton: { flex: 1, backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  categoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
