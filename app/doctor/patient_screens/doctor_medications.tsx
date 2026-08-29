import React, { useState } from 'react';
import { Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { doctorStyles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  startDate: string;
  duration: string;
  doctorName: string;
}

const ACTIVE_MEDICATIONS: Medication[] = [
  { id: '1', name: 'Micartis 80mg', dosage: '1×1', startDate: '10/03/2021', duration: '10 μέρες', doctorName: 'Δρ. Λάμπρου' },
  { id: '2', name: 'Micartis 80mg', dosage: '1×1', startDate: '10/03/2021', duration: '10 μέρες', doctorName: 'Δρ. Λάμπρου' },
];

const PREVIOUS_MEDICATIONS: Medication[] = [
  { id: '3', name: 'Depon 500mg', dosage: '1×2', startDate: '05/01/2020', duration: '5 μέρες', doctorName: 'Δρ. Παπαδοπούλου' },
  { id: '4', name: 'Augmentin 1g', dosage: '1×2', startDate: '12/11/2019', duration: '7 μέρες', doctorName: 'Δρ. Νικολάου' },
];

function MedicationCard({ item }: { item: Medication }) {
  return (
    <View style={doctorStyles.diagnosisCard}>
      <Text style={doctorStyles.diagnosisCardTitle}>{item.name}</Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Δοσολογία: </Text>{item.dosage}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Ημ. Έναρξης: </Text>{item.startDate}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Διάρκεια Χορήγησης: </Text>{item.duration}
      </Text>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Καταχώρηση: </Text>{item.doctorName}
      </Text>
    </View>
  );
}

export default function DoctorMedicationsScreen() {
  const { amka } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string }>();
  const [showPrevious, setShowPrevious] = useState(false);

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

      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.bottomMargin }}>
        <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, paddingHorizontal: SPACING.sideMargin }]}>Ενεργή Αγωγή</Text>

        {ACTIVE_MEDICATIONS.map((item) => (
          <MedicationCard key={item.id} item={item} />
        ))}

        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sideMargin, marginTop: 10 }}
          onPress={() => setShowPrevious((prev) => !prev)}
        >
          <Ionicons name={showPrevious ? 'chevron-down' : 'chevron-forward'} size={20} color={COLORS.primary} style={{ marginRight: 6 }} />
          <Text style={[doctorStyles.dashboardTitle, { color: COLORS.text, marginTop: 0, marginBottom: 0 }]}>Προηγούμενη Αγωγή</Text>
        </TouchableOpacity>

        {showPrevious && (
          <View style={{ marginTop: 12 }}>
            {PREVIOUS_MEDICATIONS.map((item) => (
              <MedicationCard key={item.id} item={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
