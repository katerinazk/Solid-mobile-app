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
import { listFolderFiles, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';

// Οι ετικέτες κατηγοριών αντιστοιχούν 1-1 στα ονόματα των φακέλων ιστορικού στο Pod του
// ασθενή (Κατηγορίες.tsx), ώστε να μπορούμε να μετρήσουμε πόσες εγγραφές έχει η καθεμία.
const CATEGORIES: { label: string; route: string }[] = [
  { label: 'Εξετάσεις', route: ROUTES.PATIENT_EXAMS },
  { label: 'Φάρμακα', route: ROUTES.PATIENT_MEDICATIONS },
  { label: 'Αλλεργίες', route: ROUTES.PATIENT_ALLERGIES },
  { label: 'Διαγνώσεις', route: ROUTES.PATIENT_DIAGNOSEIS },
  { label: 'Νοσηλίες', route: ROUTES.PATIENT_HOSPITALIZATIONS },
  { label: 'Εμβολιασμοί', route: ROUTES.PATIENT_VACCINATIONS },
];

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export default function PatientHomeScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const [patient, setPatient] = useState<{ last_name: string; sex: string | null } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

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

  useEffect(() => {
    const webId = getOwnerWebId(activePatientFolderUrl);
    if (!webId) return;

    (async () => {
      const entries = await Promise.all(
        CATEGORIES.map(async ({ label }) => {
          const folderUrl = getCategoryFolderUrl(webId, label);
          try {
            let files: string[];
            try {
              files = await listFolderFiles(folderUrl, accessToken);
            } catch {
              try {
                // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
                await new Promise((resolve) => setTimeout(resolve, 800));
                files = await listFolderFiles(folderUrl, accessToken);
              } catch {
                // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - καμία εγγραφή.
                files = [];
              }
            }
            return [label, files.filter((url) => url.endsWith('.json')).length] as const;
          } catch {
            return [label, 0] as const;
          }
        })
      );
      setCounts(Object.fromEntries(entries));
    })();
  }, [activePatientFolderUrl, accessToken]);

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

        <View style={localStyles.historyContainer}>
          <Text style={[localStyles.sectionTitle, { marginTop: 0 }]}>Ιστορικό</Text>
          {rows.map((row, index) => (
            <View key={index} style={{ flexDirection: 'row', marginBottom: SPACING.groupGap }}>
              {row.map((category, i) => (
                <TouchableOpacity
                  key={category.label}
                  style={[localStyles.categoryButton, i === 0 && row.length === 2 ? { marginRight: SPACING.groupGap } : null]}
                  onPress={() => router.push(category.route as any)}
                >
                  <Text style={localStyles.categoryButtonText}>{category.label} ({counts[category.label] ?? 0})</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <Text style={localStyles.sectionTitle}>Ειδοποιήσεις</Text>
        <Text style={[styles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
  sectionTitle: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.sectionGap, marginBottom: SPACING.groupGap },
  historyContainer: { backgroundColor: COLORS.light, borderRadius: 15, padding: 16, marginBottom: SPACING.groupGap },
  categoryButton: { flex: 1, backgroundColor: COLORS.primary, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  categoryButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
