import React, { useState, useEffect, useMemo } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { listFolderFiles, fetchFileContent, getCategoryFolderUrl, getOwnerWebId } from '../../../services/solidPod';
import { fetchPatientByAmka } from '../../../services/patients';
import { calculateAge, formatDate } from '../../../utils/age';
import { useDoctorNames, formatDoctorName } from '../../../hooks/useDoctorNames';

type Category = 'adult' | 'child';

interface Diagnosis {
  url: string;
  title: string;
  date: string;
  doctorName: string;
  doctorAmka: string;
  category: Category;
}

export default function PatientDiagnoseisScreen() {
  const { accessToken, loggedInPatientAmka, activePatientFolderUrl } = useAuth();
  const { ensureDoctorInfo, getDoctorInfo } = useDoctorNames();
  const webId = getOwnerWebId(activePatientFolderUrl);
  const folderUrl = getCategoryFolderUrl(webId, 'Διαγνώσεις');

  const [activeCategory, setActiveCategory] = useState<Category>('adult');
  const [loading, setLoading] = useState(false);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    // Προεπιλέγουμε την καρτέλα (Ενήλικες/Παιδικές) ανάλογα με την τρέχουσα ηλικία του ασθενή -
    // ο ίδιος μπορεί μετά να δει ελεύθερα και την άλλη καρτέλα.
    fetchPatientByAmka(loggedInPatientAmka).then(({ data }) => {
      if (data?.birth_date) {
        setActiveCategory(calculateAge(data.birth_date) >= 18 ? 'adult' : 'child');
      }
    }).catch(() => {});
  }, []);

  const loadDiagnoses = async () => {
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
          // Ο φάκελος δεν υπάρχει ακόμα - δεν έχουν καταχωρηθεί διαγνώσεις.
          files = [];
        }
      }

      const diagnosisFiles = files.filter((url) => url.endsWith('.json'));

      const loaded = await Promise.all(diagnosisFiles.map(async (url) => {
        try {
          const content = await fetchFileContent(url, accessToken);
          const record = JSON.parse(content);
          return { url, title: record.title, date: record.date, doctorName: record.doctorName, doctorAmka: record.doctorAmka, category: record.category } as Diagnosis;
        } catch {
          return null;
        }
      }));

      const valid = loaded.filter((d): d is Diagnosis => d !== null);
      setDiagnoses(valid);
      ensureDoctorInfo(valid.map((d) => d.doctorAmka));
    } catch {
      // Πρόβλημα σύνδεσης με το Pod - δείχνουμε απλώς άδεια λίστα αντί για σφάλμα.
      setDiagnoses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnoses();
  }, []);

  const displayDoctorName = (item: Diagnosis) => {
    const info = getDoctorInfo(item.doctorAmka);
    return info ? formatDoctorName(info) : item.doctorName;
  };

  const visibleDiagnoses = useMemo(() => {
    const filtered = diagnoses.filter((d) => d.category === activeCategory);
    return filtered.sort((a, b) => {
      const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [diagnoses, activeCategory, newestFirst]);

  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>Διαγνώσεις</Text>
      </View>

      <View style={[doctorStyles.diagnosisCategoryRow, { marginTop: SPACING.sectionGap }]}>
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

      <TouchableOpacity style={doctorStyles.diagnosisSortButton} onPress={() => setNewestFirst((prev) => !prev)}>
        <Text style={doctorStyles.diagnosisSortButtonText}>
          ↕ {newestFirst ? 'Νεότερες προς Παλαιότερες' : 'Παλαιότερες προς Νεότερες'}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
      ) : visibleDiagnoses.length === 0 ? (
        <Text style={[styles.emptyText, { marginTop: 30 }]}>Δεν υπάρχουν διαγνώσεις ακόμα.</Text>
      ) : (
        <FlatList
          data={visibleDiagnoses}
          keyExtractor={(item) => item.url}
          contentContainerStyle={{ paddingTop: SPACING.sectionGap, paddingBottom: SPACING.bottomMargin }}
          renderItem={({ item }) => (
            <View style={doctorStyles.diagnosisCard}>
              <Text style={doctorStyles.diagnosisCardTitle}>{item.title}</Text>
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
