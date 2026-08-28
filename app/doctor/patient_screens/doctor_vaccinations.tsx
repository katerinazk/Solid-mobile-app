import React, { useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';

interface Vaccination {
  id: string;
  title: string;
  commercialName: string;
  doctorName: string;
  batchNumber: string;
  doseNumber: string;
  administeredDate: string;
}

// Προσωρινά στατικά δεδομένα - θα αντικατασταθούν όταν συνδέσουμε την οθόνη με το Solid Pod
// (φάκελος MedPod/Εμβολιασμοί/), όπως έγινε ήδη με τις Διαγνώσεις.
const MOCK_VACCINATIONS: Vaccination[] = [
  {
    id: '1',
    title: 'Εποχική Γρίπη',
    commercialName: 'VaxigripTetra',
    doctorName: 'Δρ. Παπαδόπουλος Ιωάννης (Πνευμονολόγος)',
    batchNumber: 'T3A451V',
    doseNumber: '1',
    administeredDate: '15/10/2025',
  },
  {
    id: '2',
    title: 'Τέτανος - Διφθερίτιδα - Κοκκύτης',
    commercialName: 'Boostrix',
    doctorName: 'Δρ. Παπαδόπουλος Ιωάννης (Πνευμονολόγος)',
    batchNumber: 'AC22B34',
    doseNumber: '1',
    administeredDate: '05/04/2022',
  },
];

export default function DoctorVaccinationsScreen() {
  const { amka } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const [vaccinations] = useState<Vaccination[]>(MOCK_VACCINATIONS);

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

      <Text style={styles.emptyText}>Δεν υπάρχουν εμβολιασμοί.</Text>
    </SafeAreaView>
  );
}
