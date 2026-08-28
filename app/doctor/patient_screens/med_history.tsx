import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { ROUTES } from '../../../constants/routes';
import { SPACING } from '../../../constants/designSystem';

export default function DoctorHistoryScreen() {
  const { amka, firstName, lastName, webId, birthDate } = useLocalSearchParams<{ amka: string; firstName: string; lastName: string; webId: string; birthDate: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.historyTitle}>Ιστορικό</Text>
      </View>

      <Text style={styles.historyAmka}>ΑΜΚΑ: <Text style={styles.historyAmkaValue}>{amka}</Text></Text>

      <View style={{ paddingHorizontal: SPACING.sideMargin, marginTop: 20 }}>
        <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Εξετάσεις', 'Η λειτουργία έρχεται σύντομα.')}>
          <Text style={styles.historyCategoryButtonText}>Εξετάσεις</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Φάρμακα', 'Η λειτουργία έρχεται σύντομα.')}>
          <Text style={styles.historyCategoryButtonText}>Φάρμακα</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_ALLERGIES,
            params: { amka, firstName, lastName, webId },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Αλλεργίες</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_DIAGNOSEIS,
            params: { amka, firstName, lastName, webId, birthDate },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Διαγνώσεις</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyCategoryButton} onPress={() => Alert.alert('Νοσηλίες', 'Η λειτουργία έρχεται σύντομα.')}>
          <Text style={styles.historyCategoryButtonText}>Νοσηλίες</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyCategoryButton}
          onPress={() => router.push({
            pathname: ROUTES.DOCTOR_VACCINATIONS,
            params: { amka, firstName, lastName, webId },
          })}
        >
          <Text style={styles.historyCategoryButtonText}>Εμβολιασμοί</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
