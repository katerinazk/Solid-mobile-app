import React, { useEffect, useState } from 'react';
import { Text, View, TextInput, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { SPACING, TYPOGRAPHY } from '../../../constants/designSystem';
import { useAuth } from '../../../hooks/useAuth';
import { fetchDoctorByAmka } from '../../../services/doctors';

export default function DoctorHomeScreen() {
  const { loggedInDoctorAmka } = useAuth();
  const [doctor, setDoctor] = useState<{ last_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await fetchDoctorByAmka(loggedInDoctorAmka);
        setDoctor(data);
      } catch {
        // Αν αποτύχει, απλά δεν εμφανίζεται το επίθετο στο καλωσόρισμα.
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={localStyles.welcome}>Καλωσωρίσατε Δρ. {doctor?.last_name || ''}</Text>
      </View>

      <View style={{ width: '70%', alignSelf: 'center', marginBottom: SPACING.groupGap }}>
        <Text style={styles.dashboardLabel}>Αναζήτηση ΑΜΚΑ:</Text>
        <View style={[styles.searchContainer, { marginHorizontal: 0 }]}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Αναζήτηση..."
            placeholderTextColor={COLORS.primary}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={styles.dashboardTitle}>Ειδοποιήσεις</Text>
        <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  welcome: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary, marginTop: SPACING.groupGap, marginBottom: SPACING.sectionGap },
});
