import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { listFolderFilesOrEmpty, getCategoryFolderUrl } from '../../../services/solidPod';

// Ίδιες ετικέτες με τους φακέλους ιστορικού στο Pod του ασθενή (Κατηγορίες.tsx) - ίδιο σύνολο
// με το CATEGORIES της αρχικής του ασθενή, ώστε να μετράμε τις ίδιες εγγραφές.
const CATEGORIES = ['Εξετάσεις', 'Φάρμακα', 'Αλλεργίες', 'Διαγνώσεις', 'Νοσηλείες', 'Εμβολιασμοί'];

export default function DoctorHistoryScreen() {
  const { amka, firstName, lastName, webId, birthDate, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string; accessType: string }>();

  // Ο φύλακας πετάει έξω τον γιατρό αν καταργηθεί η πρόσβαση και δίνει τον ενημερωμένο τύπο,
  // ώστε οι κατηγορίες να ανοίγουν πάντα με το δικαίωμα που ισχύει τώρα.
  const { accessType: liveAccessType } = useDoctorAccessGuard(amka, accessType);
  const { accessToken } = useAuth();
  const patientName = `${firstName} ${lastName}`;

  // Πόσες εγγραφές έχει η καθεμιά, όπως στην αρχική του ασθενή - εδώ μετριέται απευθείας σε
  // κάθε άνοιγμα της οθόνης αντί μέσω προφόρτωσης, γιατί ο γιατρός βλέπει φάκελο άλλου
  // ανθρώπου: δεν υπάρχει δική του σύνδεση στην οποία να είχε ήδη ξεκινήσει η μέτρηση.
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!webId || !accessToken) return;
    let canceled = false;

    CATEGORIES.forEach((category) => {
      listFolderFilesOrEmpty(getCategoryFolderUrl(webId, category), accessToken)
        .then((files) => {
          if (canceled) return;
          const total = files.filter((url) => url.endsWith('.json')).length;
          setCounts((prev) => ({ ...prev, [category]: total }));
        })
        .catch(() => {
          // Αν αποτύχει, η κατηγορία μένει χωρίς νούμερο - δεν δείχνουμε σφάλμα.
        });
    });

    return () => { canceled = true; };
  }, [webId, accessToken]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.historyTitle}>Ιστορικό</Text>
        <Text style={styles.historyPatientName}>{patientName}</Text>
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: 20 }}>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_EXAMS,
            params: { amka, firstName, lastName, webId, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Εξετάσεις ({counts['Εξετάσεις'] ?? 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_MEDICATIONS,
            params: { amka, firstName, lastName, webId, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Φάρμακα ({counts['Φάρμακα'] ?? 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_ALLERGIES,
            params: { amka, firstName, lastName, webId, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Αλλεργίες ({counts['Αλλεργίες'] ?? 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_DIAGNOSEIS,
            params: { amka, firstName, lastName, webId, birthDate, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Διαγνώσεις ({counts['Διαγνώσεις'] ?? 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_HOSPITALIZATIONS,
            params: { amka, firstName, lastName, webId, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Νοσηλείες ({counts['Νοσηλείες'] ?? 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_VACCINATIONS,
            params: { amka, firstName, lastName, webId, accessType: liveAccessType },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Εμβολιασμοί ({counts['Εμβολιασμοί'] ?? 0})</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
