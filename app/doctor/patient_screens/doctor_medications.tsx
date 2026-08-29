import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';

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

function MedicationCard({ item }: { item: Medication }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
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
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
      </Text>
    </View>
  );
}

export default function DoctorMedicationsScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [loading, setLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);

  const loadMedications = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
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
          // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - θα δημιουργηθεί αυτόματα με την πρώτη
          // αγωγή που θα προστεθεί. Μέχρι τότε δείχνουμε απλώς άδεια λίστα.
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

      setMedications(loaded.filter((m): m is Medication => m !== null));
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

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

    return { activeMedications: active, previousMedications: previous };
  }, [medications]);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Φάρμακα</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]}>
          <Text style={styles.addButtonText}>+ Προσθήκη Φαρμάκου</Text>
        </TouchableOpacity>

        <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.sectionGap }}>
          <Text style={doctorStyles.dashboardLabel}>Αναζήτηση φαρμάκου:</Text>
          <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
            <TextInput style={doctorStyles.searchInput} placeholder="Αναζήτηση..." placeholderTextColor={COLORS.primary} />
          </View>
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
            activeMedications.map((item) => <MedicationCard key={item.url} item={item} />)
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
              {previousMedications.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: SPACING.sideMargin }]}>Δεν υπάρχουν προηγούμενες αγωγές.</Text>
              ) : (
                previousMedications.map((item) => <MedicationCard key={item.url} item={item} />)
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
