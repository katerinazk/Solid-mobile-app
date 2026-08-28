import React, { useState, useEffect } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, ensureCategoryFolder } from '../../../services/solidPod';
import { formatDate } from '../../../utils/age';

const CATEGORY = 'Εμβολιασμοί';

interface Vaccination {
  url: string;
  title: string;
  commercialName: string;
  doctorName: string;
  batchNumber: string;
  doseNumber: string;
  administeredDate: string;
}

export default function DoctorVaccinationsScreen() {
  const { amka, webId } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const { accessToken } = useAuth();
  const folderUrl = webId ? getCategoryFolderUrl(webId, CATEGORY) : '';

  const [loading, setLoading] = useState(false);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);

  const loadVaccinations = async () => {
    if (!webId) return Alert.alert("Σφάλμα", "Δεν βρέθηκε WebID.");
    try {
      setLoading(true);
      let files: string[];
      try {
        files = await listFolderFiles(folderUrl, accessToken);
      } catch {
        // Ο φάκελος πιθανώς δεν υπάρχει ακόμα - τον δημιουργούμε και τον αφήνουμε κενό.
        await ensureCategoryFolder(webId, CATEGORY, accessToken);
        files = [];
      }

      const vaccinationFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(vaccinationFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return {
            url,
            title: record.title,
            commercialName: record.commercialName,
            doctorName: record.doctorName,
            batchNumber: record.batchNumber,
            doseNumber: record.doseNumber,
            administeredDate: record.administeredDate,
          } as Vaccination;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((v): v is Vaccination => v !== null);
      valid.sort((a, b) => new Date(b.administeredDate).getTime() - new Date(a.administeredDate).getTime());
      setVaccinations(valid);
    } catch (error: any) {
      Alert.alert("Πρόβλημα", error.message || "Ο φάκελος είναι κλειδωμένος (Private) ή δεν υπάρχει.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVaccinations();
  }, []);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εμβολιασμοί</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity style={[styles.addButton, { borderRadius: 25 }]}>
          <Text style={styles.addButtonText}>+ Προσθήκη Εμβολιασμού</Text>
        </TouchableOpacity>

        <TouchableOpacity style={doctorStyles.diagnosisSortButton}>
          <Text style={doctorStyles.diagnosisSortButtonText}>↕ Νεότερες προς Παλαιότερες</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : vaccinations.length === 0 ? (
        <Text style={styles.emptyText}>Δεν υπάρχουν εμβολιασμοί.</Text>
      ) : (
        <FlatList
          data={vaccinations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Εμπορική Ονομασία: </Text>{item.commercialName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Παρτίδας: </Text>{item.batchNumber}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Αριθμός Δόσης: </Text>{item.doseNumber}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Ημερομηνία Χορήγησης: </Text>{formatDate(item.administeredDate)}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
