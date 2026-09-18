import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { PatientHeader } from '../../../components/patient/PatientHeader';
import { fetchPatientByAmka } from '../../../services/patients';
import { listFolderFiles, getCategoryFolderUrl, getOwnerWebId, syncPodAcl } from '../../../services/solidPod';
import { usePatientAccessList } from '../../../hooks/usePatientAccessList';
import { markAccessAclSynced } from '../../../services/access';
import { grantsPodAccess } from '../../../constants/accessTypes';
import {
  getCount,
  setCount,
  countsAge,
  subscribeCounts,
  isPrefetchRunning,
} from '../../../utils/podPrefetchStore';

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

// Μετά από τόση ώρα τα νούμερα θεωρούνται παλιά και ξαναμετρώνται στο παρασκήνιο, χωρίς να
// σβήσουν από την οθόνη στο μεταξύ.
const COUNTS_MAX_AGE_MS = 30000;

// Μετρά τις εγγραφές μιας κατηγορίας. Είναι πλέον ΕΦΕΔΡΕΙΑ: κανονικά τα νούμερα έρχονται από
// την προφόρτωση της σύνδεσης. Χρειάζεται όταν δεν έτρεξε προφόρτωση (π.χ. επιστροφή στην
// οθόνη πολύ αργότερα) ή όταν κάποια κατηγορία απέτυχε να προφορτωθεί.
async function countCategory(webId: string, category: string, accessToken: string): Promise<number> {
  const folderUrl = getCategoryFolderUrl(webId, category);
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
      return 0;
    }
  }
  return files.filter((url) => url.endsWith('.json')).length;
}

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

export default function PatientHomeScreen() {
  const { loggedInPatientAmka, accessToken, activePatientFolderUrl } = useAuth();
  const [patient, setPatient] = useState<{ last_name: string; sex: string | null } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const { accessList } = usePatientAccessList();
  const aclSynced = useRef(false);

  // Ο ασθενής μπορεί να έχει δώσει πρόσβαση σε γιατρό που δεν είχε ακόμα WebID (δεν είχε κάνει
  // ποτέ Solid login), οπότε ο γιατρός δεν είχε μπει στο ACL του Pod. Μόνο ο ασθενής μπορεί να
  // γράψει σε αυτό, γι' αυτό το ξαναγράφουμε μία φορά σε κάθε είσοδό του: όποιος γιατρός έχει
  // αποκτήσει WebID στο μεταξύ μπαίνει τώρα, χωρίς να χρειαστεί να κάνει ο ασθενής τίποτα.
  useEffect(() => {
    if (aclSynced.current) return;
    if (!activePatientFolderUrl || !accessToken) return;
    if (!accessList.some((a) => a.doctors?.web_id && grantsPodAccess(a.access_type))) return;

    aclSynced.current = true;
    (async () => {
      try {
        await syncPodAcl({ activePatientFolderUrl, accessToken, accessList });
        // Όσοι γιατροί μπήκαν όντως στο ACL σημειώνονται ως συγχρονισμένοι, ώστε να αρχίσει
        // να τους εμφανίζεται ο φάκελος του ασθενή.
        await markAccessAclSynced(
          loggedInPatientAmka,
          // Όσοι έχουν "Καμία Πρόσβαση" δεν μπήκαν στο ACL, οπότε δεν σημειώνονται ούτε εδώ -
          // αλλιώς ο συγχρονισμός θα τους επέστρεφε σιωπηλά την πρόσβαση.
          accessList.filter((a) => a.doctors?.web_id && grantsPodAccess(a.access_type)).map((a) => a.doctor_amka),
        );
      } catch (error) {
        // Δεν ενοχλούμε τον ασθενή: αν αποτύχει, ξαναδοκιμάζει στην επόμενη είσοδο.
        console.error("Αποτυχία συγχρονισμού ACL:", error);
      }
    })();
  }, [accessList, activePatientFolderUrl, accessToken]);

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

  // Τα νούμερα έρχονται από την προφόρτωση που ξεκινά στη σύνδεση. Πριν, η οθόνη έκανε μόνη
  // της τις ίδιες έξι αναζητήσεις φακέλων: το δίκτυο πληρωνόταν δύο φορές και τα νούμερα
  // εμφανίζονταν όλα μαζί στο τέλος. Πλέον εμφανίζονται ένα-ένα καθώς έρχονται.
  useEffect(() => {
    const webId = getOwnerWebId(activePatientFolderUrl);
    if (!webId) return;

    const readStore = () => {
      const fromStore: Record<string, number> = {};
      for (const { label } of CATEGORIES) {
        const total = getCount(webId, label);
        if (total !== undefined) fromStore[label] = total;
      }
      setCounts(fromStore);
      return fromStore;
    };

    const unsubscribe = subscribeCounts(readStore);
    const known = readStore();

    // Όσο τρέχει η προφόρτωση δεν μετράμε τίποτα μόνοι μας: θα διπλασιάζαμε τα αιτήματα για
    // το ίδιο αποτέλεσμα. Τα νούμερα θα έρθουν μέσω της συνδρομής.
    if (!isPrefetchRunning(webId)) {
      const missing = CATEGORIES.filter(({ label }) => known[label] === undefined);
      const stale = countsAge() > COUNTS_MAX_AGE_MS;
      const toCount = missing.length > 0 ? missing : (stale ? CATEGORIES : []);

      toCount.forEach(({ label }) => {
        countCategory(webId, label, accessToken)
          .then((total) => setCount(webId, label, total))
          .catch(() => {
            // Αν αποτύχει, η κατηγορία μένει χωρίς νούμερο - δεν δείχνουμε σφάλμα.
          });
      });
    }

    return unsubscribe;
  }, [activePatientFolderUrl, accessToken]);

  const salutation = patient?.sex?.trim().toLowerCase().startsWith('γυναίκ') ? 'κυρία' : 'κύριε';
  const rows = chunkPairs(CATEGORIES);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <Text style={localStyles.welcome}>Καλωσορίσατε {salutation} {patient?.last_name || ''}</Text>

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
