import React, { useEffect, useState, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { doctorStyles } from '../../constants/doctorStyles';
import { SPACING } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../services/solidPod';
import { formatDate } from '../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../hooks/useDoctorNames';

const CATEGORY = 'Εμβολιασμοί';

interface Vaccination {
  url: string;
  title: string;
  commercialName: string;
  doctorName: string;
  doctorAmka: string;
  batchNumber: string;
  doseNumber: string;
  administeredDate: string;
}

export default function PatientVaccinationsScreen() {
  const { accessToken, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, CATEGORY);

  const [loading, setLoading] = useState(false);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [newestFirst, setNewestFirst] = useState(true);

  const loadVaccinations = async () => {
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
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί εμβολιασμοί.
          files = [];
        }
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
            doctorAmka: record.doctorAmka,
            batchNumber: record.batchNumber,
            doseNumber: record.doseNumber,
            administeredDate: record.administeredDate,
          } as Vaccination;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((v): v is Vaccination => v !== null);
      setVaccinations(valid);
      ensureDoctorInfo(valid.map((v) => v.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setVaccinations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVaccinations();
  }, []);

  const displayDoctorName = (item: Vaccination) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const sortedVaccinations = useMemo(() => {
    return [...vaccinations].sort((a, b) => {
      const diff = new Date(b.administeredDate).getTime() - new Date(a.administeredDate).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [vaccinations, newestFirst]);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Εμβολιασμοί</Text>
      </View>

      <TouchableOpacity style={[doctorStyles.diagnosisSortButton, { marginTop: SPACING.sectionGap }]} onPress={() => setNewestFirst((prev) => !prev)}>
        <Text style={doctorStyles.diagnosisSortButtonText}>
          ↕ {newestFirst ? 'Νεότεροι προς Παλαιότεροι' : 'Παλαιότεροι προς Νεότεροι'}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : sortedVaccinations.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν υπάρχουν εμβολιασμοί ακόμα.</Text>
      ) : (
        <FlatList
          data={sortedVaccinations}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingTop: SPACING.sectionGap, paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>

              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Εμπορική Ονομασία: </Text>{item.commercialName}
              </Text>
              <Text style={doctorStyles.diagnosisCardDetail}>
                <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{displayDoctorName(item)}
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
