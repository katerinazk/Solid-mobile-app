import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { CodedCardTitle } from '../../../components/CodedCardTitle';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { isCompleteRecord } from '../../../utils/podRecords';
import { usePodAutoRefresh } from '../../../hooks/usePodAutoRefresh';
import { listFolderFiles, fetchFileContent, saveFileContent, deleteFile, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { formatDuration, medicationEndDate } from '../../../utils/duration';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Φάρμακα';

interface Medication {
  url: string;
  title: string;
  dosage: string;
  // Τρόπος χορήγησης (χάπι, ενέσιμο, ...). Λείπει από τις εγγραφές πριν υπάρξει το πεδίο.
  route?: string;
  startDate: string;
  durationDays: number;
  // Προαιρετικοί, δίπλα στις μέρες. Λείπουν από τις εγγραφές πριν υπάρξει το πεδίο.
  durationMonths?: number;
  doctorName: string;
  doctorAmka: string;
  // false = ο γιατρός μόλις το καταχώρησε και ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη".
  // undefined = παλιά εγγραφή από πριν υπάρξει αυτή η έννοια -> θεωρείται ήδη ενεργή.
  started?: boolean;
  // Κωδικός του διεθνούς προτύπου (ICD-10 / ATC / LOINC) και η κατηγορία στην οποία ανήκει,
  // όπως τα κατέγραψε ο γιατρός. Λείπουν από τις παλιές εγγραφές ελεύθερου κειμένου.
  code?: string;
  parentName?: string;
}

// Ένα φάρμακο είναι "εκκρεμές" μόνο όσο ο ασθενής δεν έχει πατήσει ακόμα "Έναρξη" - μόλις το
// κάνει, περνάει αμέσως στην κανονική ενεργή αγωγή, ό,τι ημερομηνία κι αν έχει.
function isPending(item: Medication): boolean {
  return item.started === false;
}

export default function PatientMedicationsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [loading, setLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previousNewestFirst, setPreviousNewestFirst] = useState(true);

  const loadMedications = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        try {
          // Μπορεί να ήταν στιγμιαίο πρόβλημα του server - ξαναδοκιμάζουμε μία φορά.
          await new Promise((resolve) => setTimeout(resolve, 800));
          files = await listFolderFiles(folderUrl, accessToken);
        } catch {
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί φάρμακα.
          files = [];
        }
      }

      const medicationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(medicationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          // Αρχεία που δεν έγραψε η εφαρμογή, ή παλιές εγγραφές χωρίς κωδικό, δεν εμφανίζονται.
          if (!isCompleteRecord('Φάρμακα', record)) return null;
          return {
            url,
            title: record.title,
            code: record.code,
            parentName: record.parentName,
            dosage: record.dosage,
            route: record.route,
            startDate: record.startDate,
            durationDays: record.durationDays,
            durationMonths: record.durationMonths,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
            started: record.started,
          } as Medication;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((m): m is Medication => m !== null);
      setMedications(valid);
      ensureDoctorInfo(valid.map((m) => m.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setMedications([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  const { refreshing, onRefresh } = usePodAutoRefresh(loadMedications);

  const displayDoctorName = (item: Medication) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const handleStartMedication = async (item: Medication) => {
    if (!accessToken) {
      alert("ΣΦΑΛΜΑ: Το Access Token λείπει!");
      return;
    }

    try {
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const record = {
        title: item.title,
        // Το "Έναρξη" ξαναγράφει όλο το αρχείο - χωρίς αυτά θα χανόταν ο κωδικός ATC.
        code: item.code,
        parentName: item.parentName,
        route: item.route,
        dosage: item.dosage,
        startDate,
        durationDays: item.durationDays,
        durationMonths: item.durationMonths,
        doctorName: item.doctorName,
        doctorAmka: item.doctorAmka,
        started: true,
      };

      await saveFileContent(item.url, accessToken, JSON.stringify(record));

      setMedications((prev) => prev.map((m) => m.url === item.url ? { ...m, startDate, started: true } : m));
    } catch (error: any) {
      alert(error.message || "Αποτυχία σύνδεσης με το Pod.");
    }
  };

  const handleDeleteMedication = (item: Medication) => {
    Alert.alert(
      "Διαγραφή",
      "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το φάρμακο;",
      [
        { text: "Ακύρωση", style: "cancel" },
        {
          text: "Διαγραφή",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFile(item.url, accessToken);
              setMedications((prev) => prev.filter((m) => m.url !== item.url));
            } catch (error: any) {
              alert(error.message || "Αποτυχία διαγραφής.");
            }
          }
        }
      ]
    );
  };

  const { activeMedications, previousMedications } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = searchQuery.trim().toLowerCase();
    const active: Medication[] = [];
    const previous: Medication[] = [];

    for (const med of medications) {
      // Η αναζήτηση γίνεται στο όνομα του φαρμάκου, πριν τον διαχωρισμό σε ενεργά/προηγούμενα,
      // ώστε το φιλτράρισμα να ισχύει και στις δύο ενότητες.
      if (query && !med.title?.toLowerCase().includes(query)) continue;

      // Το φάρμακο που δεν έχει ξεκινήσει ακόμα είναι τρέχουσα συνταγή, όχι περασμένη αγωγή.
      // Χωρίς αυτό θα έπεφτε στις προηγούμενες, αφού δεν έχει καθόλου ημερομηνία έναρξης.
      if (med.started === false) {
        active.push(med);
        continue;
      }

      const endDate = medicationEndDate(med.startDate, med.durationDays, med.durationMonths);
      if (endDate >= today) {
        active.push(med);
      } else {
        previous.push(med);
      }
    }

    // Τα εκκρεμή φάρμακα (δεν έχει πατηθεί ακόμα "Έναρξη") εμφανίζονται πάντα πρώτα.
    active.sort((a, b) => Number(isPending(b)) - Number(isPending(a)));

    previous.sort((a, b) => {
      const diff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      return previousNewestFirst ? diff : -diff;
    });

    return { activeMedications: active, previousMedications: previous };
  }, [medications, previousNewestFirst, searchQuery]);

  // Όσο υπάρχει αναζήτηση ανοίγουμε μόνοι μας την "Προηγούμενη Αγωγή", αλλιώς τα αποτελέσματα
  // που βρίσκονται εκεί θα έμεναν κρυμμένα μέσα στην κλειστή ενότητα.
  const previousSectionOpen = showPrevious || (searchQuery.trim().length > 0 && previousMedications.length > 0);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Φάρμακα</Text>
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: SPACING.sectionGap }}>
        <Text style={doctorStyles.dashboardLabel}>Αναζήτηση φαρμάκου:</Text>
        <View style={doctorStyles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <TextInput
            style={doctorStyles.searchInput}
            placeholder="Αναζήτηση..."
            placeholderTextColor={COLORS.primary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ενεργή Αγωγή</Text>

          {activeMedications.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
              {searchQuery.trim() ? 'Δεν βρέθηκε φάρμακο με αυτό το όνομα.' : 'Δεν υπάρχουν ενεργές αγωγές.'}
            </Text>
          ) : (
            activeMedications.map((item) =>
              isPending(item) ? (
                <View key={item.url} style={doctorStyles.diagnosisCard}>
                  <View style={doctorStyles.diagnosisCardHeader}>
                    <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                    <Text style={{ color: COLORS.danger, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText }}>ΕΚΚΡΕΜΕΣ</Text>
                  </View>
                  {!!item.route && (
                    <Text style={doctorStyles.diagnosisCardDetail}>
                      <Text style={doctorStyles.diagnosisCardLabel}>Τρόπος Χορήγησης: </Text>{item.route}
                    </Text>
                  )}
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
                  </Text>

                  <View style={{ flexDirection: 'row', marginTop: 12 }}>
                    <TouchableOpacity
                      style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginRight: 8, marginBottom: 0 }]}
                      onPress={() => handleStartMedication(item)}
                    >
                      <Text style={doctorStyles.diagnosisSortButtonText}>Έναρξη</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}
                      onPress={() => handleDeleteMedication(item)}
                    >
                      <Text style={doctorStyles.diagnosisSortButtonText}>Διαγραφή</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View key={item.url} style={doctorStyles.diagnosisCard}>
                  <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                  {!!item.route && (
                    <Text style={doctorStyles.diagnosisCardDetail}>
                      <Text style={doctorStyles.diagnosisCardLabel}>Τρόπος Χορήγησης: </Text>{item.route}
                    </Text>
                  )}
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
                  </Text>
                </View>
              )
            )
          )}

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10 }}
            onPress={() => setShowPrevious((prev) => !prev)}
          >
            <Ionicons name={previousSectionOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
          </TouchableOpacity>

          {previousSectionOpen && (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setPreviousNewestFirst((prev) => !prev)}>
                <Text style={doctorStyles.diagnosisSortButtonText}>
                  ↕ {previousNewestFirst ? 'Νεότερα προς Παλαιότερα' : 'Παλαιότερα προς Νεότερα'}
                </Text>
              </TouchableOpacity>

              {previousMedications.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>
                  {searchQuery.trim() ? 'Δεν βρέθηκε φάρμακο με αυτό το όνομα.' : 'Δεν υπάρχουν προηγούμενες αγωγές.'}
                </Text>
              ) : (
                previousMedications.map((item) => {
                  return (
                    <View key={item.url} style={doctorStyles.diagnosisCard}>
                      <CodedCardTitle code={item.code} title={item.title} parentName={item.parentName} />
                      {!!item.route && (
                        <Text style={doctorStyles.diagnosisCardDetail}>
                          <Text style={doctorStyles.diagnosisCardLabel}>Τρόπος Χορήγησης: </Text>{item.route}
                        </Text>
                      )}
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                      </Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
                      </Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{formatDuration(item.durationDays, item.durationMonths)}
                      </Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
