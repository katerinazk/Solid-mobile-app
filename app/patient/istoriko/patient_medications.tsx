import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

const CATEGORY = 'Φάρμακα';

interface Medication {
  url: string;
  title: string;
  dosage: string;
  startDate: string;
  durationDays: number;
  doctorName: string;
  doctorAmka: string;
}

// Ένα φάρμακο θεωρείται "εκκρεμές" όσο η ημερομηνία έναρξής του δεν έχει περάσει ακόμα -
// δηλαδή μόλις καταχωρήθηκε από τον γιατρό, ο ασθενής δεν το έχει "ξεκινήσει" ακόμα. Μόλις
// περάσει η ημερομηνία έναρξης, εμφανίζεται πλέον σαν κανονική ενεργή αγωγή.
function isPending(item: Medication): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(item.startDate);
  start.setHours(0, 0, 0, 0);
  return start >= today;
}

export default function PatientMedicationsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [loading, setLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [previousNewestFirst, setPreviousNewestFirst] = useState(true);

  const loadMedications = async () => {
    try {
      setLoading(true);
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
          return {
            url,
            title: record.title,
            dosage: record.dosage,
            startDate: record.startDate,
            durationDays: record.durationDays,
            doctorName: record.doctorName,
            doctorAmka: record.doctorAmka,
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  const displayDoctorName = (item: Medication) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const { activeMedications, previousMedications } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active: Medication[] = [];
    const previous: Medication[] = [];

    for (const med of medications) {
      const endDate = new Date(med.startDate);
      endDate.setDate(endDate.getDate() + (med.durationDays || 0));
      if (endDate >= today) {
        active.push(med);
      } else {
        previous.push(med);
      }
    }

    previous.sort((a, b) => {
      const diff = new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      return previousNewestFirst ? diff : -diff;
    });

    return { activeMedications: active, previousMedications: previous };
  }, [medications, previousNewestFirst]);

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
          <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ενεργή Αγωγή</Text>

          {activeMedications.length === 0 ? (
            <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν ενεργές αγωγές.</Text>
          ) : (
            activeMedications.map((item) =>
              isPending(item) ? (
                <View key={item.url} style={doctorStyles.diagnosisCard}>
                  <View style={doctorStyles.diagnosisCardHeader}>
                    <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                    <Text style={{ color: COLORS.danger, fontWeight: 'bold', fontSize: TYPOGRAPHY.secondaryText }}>ΕΚΚΡΕΜΕΣ</Text>
                  </View>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{item.durationDays} μέρες
                  </Text>

                  <View style={{ flexDirection: 'row', marginTop: 12 }}>
                    <TouchableOpacity
                      style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginRight: 8, marginBottom: 0 }]}
                      onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}
                    >
                      <Text style={doctorStyles.diagnosisSortButtonText}>Έναρξη</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[doctorStyles.diagnosisSortButton, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}
                      onPress={() => alert('Η λειτουργία έρχεται σύντομα.')}
                    >
                      <Text style={doctorStyles.diagnosisSortButtonText}>Διαγραφή</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View key={item.url} style={doctorStyles.diagnosisCard}>
                  <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
                  </Text>
                  <Text style={doctorStyles.diagnosisCardDetail}>
                    <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{item.durationDays} μέρες
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
            <Ionicons name={showPrevious ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
          </TouchableOpacity>

          {showPrevious && (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setPreviousNewestFirst((prev) => !prev)}>
                <Text style={doctorStyles.diagnosisSortButtonText}>
                  ↕ {previousNewestFirst ? 'Νεότερα προς Παλαιότερα' : 'Παλαιότερα προς Νεότερα'}
                </Text>
              </TouchableOpacity>

              {previousMedications.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν προηγούμενες αγωγές.</Text>
              ) : (
                previousMedications.map((item) => {
                  return (
                    <View key={item.url} style={doctorStyles.diagnosisCard}>
                      <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
                      </Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{formatDate(item.startDate)}
                      </Text>
                      <Text style={doctorStyles.diagnosisCardDetail}>
                        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{item.durationDays} μέρες
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
