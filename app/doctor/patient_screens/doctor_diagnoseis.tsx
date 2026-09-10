import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, ActivityIndicator, Alert, SafeAreaView, StatusBar, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { useAuth } from '../../../hooks/useAuth';
import { useDoctorAccessGuard } from '../../../hooks/useDoctorAccessGuard';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFilesOrEmpty, fetchFileContent, deleteFile, getCategoryFolderUrl, isPodAccessDenied } from '../../../services/solidPod';
import { calculateAge, formatDate } from '../../../utils/age';
import { SPACING } from '../../../constants/designSystem';
import { useDoctorNames, formatDoctorLastNameOnly } from '../../../hooks/useDoctorNames';
import { CodedCardTitle } from '../../../components/CodedCardTitle';

type Category = 'adult' | 'child';

interface Diagnosis {
  url: string;
  title: string;
  date: string;
  doctorName: string;
  doctorAmka: string;
  category: Category;
  // Κωδικός ICD-10. Λείπει από τις παλιές εγγραφές, που ήταν ελεύθερο κείμενο.
  code?: string;
  // Η κατηγορία-γονέας του κωδικού, ως συμφραζόμενο ("Κάτω γνάθος" -> κακοήθη νεοπλάσματα).
  parentName?: string;
}

export default function DoctorDiagnoseisScreen() {
  const { amka, firstName, lastName, webId, birthDate, accessType } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string; accessType: string }>();
  const { accessToken, loggedInDoctorAmka } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const patientName = `${firstName} ${lastName}`;
  const folderUrl = webId ? getCategoryFolderUrl(webId, 'Διαγνώσεις') : '';
  // Ο γιατρός με "Μόνο Ανάγνωση" πρόσβαση βλέπει το ιστορικό όπως ακριβώς ο ίδιος ο ασθενής -
  // χωρίς δυνατότητα προσθήκης/επεξεργασίας/διαγραφής.
  const { isReadOnly, checkAccess } = useDoctorAccessGuard(amka, accessType);

  const patientCategory: Category = calculateAge(birthDate) >= 18 ? 'adult' : 'child';
  const [activeCategory, setActiveCategory] = useState<Category>(patientCategory);

  const [loading, setLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [newestFirst, setNewestFirst] = useState(true);


  const loadDiagnoses = async (silent = false) => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      if (!silent) setLoading(true);
      const files = await listFolderFilesOrEmpty(folderUrl, accessToken);
      const diagnosisFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(diagnosisFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return { url, title: record.title, date: record.date, doctorName: record.doctorName, doctorAmka: record.doctorAmka, category: record.category, code: record.code, parentName: record.parentName } as Diagnosis;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((d): d is Diagnosis => d !== null);
      valid.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDiagnoses(valid);
      ensureDoctorInfo(valid.map((d) => d.doctorAmka));
    } catch (error: any) {
      // 403 από το Pod = ο ασθενής κατάργησε την πρόσβαση όσο ο γιατρός ήταν μέσα. Το αναλαμβάνει
      // ο φύλακας, που βγάζει το σωστό μήνυμα και τον επιστρέφει στην αρχική του.
      if (isPodAccessDenied(error)) {
        checkAccess();
        return;
      }
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadDiagnoses);

  const visibleDiagnoses = useMemo(() => {
    const filtered = diagnoses.filter((d) => d.category === activeCategory);
    return filtered.sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [diagnoses, activeCategory, newestFirst]);

  const canAddDiagnosis = activeCategory === patientCategory && !isReadOnly;

  const displayDoctorName = (item: Diagnosis) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorLastNameOnly(info) : item.doctorName;
  };

  const openForm = (item?: Diagnosis) => {
    router.push({
      pathname: ROUTES.DOCTOR_DIAGNOSIS_FORM,
      params: {
        amka,
        webId,
        accessType,
        category: patientCategory,
        ...(item ? {
          editUrl: item.url,
          editCode: item.code,
          editTitle: item.title,
          editParentName: item.parentName,
          editDate: item.date,
          editDoctorName: item.doctorName,
          editDoctorAmka: item.doctorAmka,
        } : {}),
      },
    });
  };

  const handleDeleteDiagnosis = async (item: Diagnosis) => {
    // Η απόφαση του ασθενή υπερισχύει: αν άλλαξε ή καταργήθηκε η πρόσβαση στο μεταξύ,
    // η ενέργεια ακυρώνεται.
    if (!(await checkAccess())) return;

    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη διάγνωση;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setDiagnoses((prev) => prev.filter((d) => d.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Διαγνώσεις</Text>
      </View>

      <View style={doctorStyles.diagnosisCategoryRow}>
        <TouchableOpacity
          style={[doctorStyles.diagnosisCategoryButton, activeCategory === 'adult' ? doctorStyles.diagnosisCategoryButtonActive : doctorStyles.diagnosisCategoryButtonInactive]}
          onPress={() => setActiveCategory('adult')}
        >
          <Text style={doctorStyles.diagnosisCategoryButtonText}>Ενήλικες</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[doctorStyles.diagnosisCategoryButton, activeCategory === 'child' ? doctorStyles.diagnosisCategoryButtonActive : doctorStyles.diagnosisCategoryButtonInactive]}
          onPress={() => setActiveCategory('child')}
        >
          <Text style={doctorStyles.diagnosisCategoryButtonText}>Παιδικές</Text>
        </TouchableOpacity>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        {canAddDiagnosis && (
          <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]} onPress={() => openForm()}>
            <Text style={styles.addButtonText}>+ Προσθήκη Διάγνωσης</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setNewestFirst((prev) => !prev)}>
          <Text style={doctorStyles.diagnosisSortButtonText}>
            ↕ {newestFirst ? 'Νεότερες προς Παλαιότερες' : 'Παλαιότερες προς Νεότερες'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : visibleDiagnoses.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν διαγνώσεις.</Text>
      ) : (
        <FlatList
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          data={visibleDiagnoses}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <View style={doctorStyles.diagnosisCardHeader}>
                <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                {/* TODO: αφαίρεση fallback - προσωρινό ξέσκαρτισμα παλιών εγγραφών χωρίς doctorAmka */}
                {!isReadOnly && (item.doctorAmka === loggedInDoctorAmka || !item.doctorAmka) && (
                  <View style={{ flexDirection: 'row' }}>
                    <TouchableOpacity onPress={() => openForm(item)} style={{ marginRight: 15 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteDiagnosis(item)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία: </Text>{formatDate(item.date)}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
              </Text>
            </View>
          )}
        />
      )}

    </SafeAreaView>
  );
}
