import React from 'react';
import { Text, View, TextInput, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { SPACING } from '../../../constants/designSystem';

export default function DoctorHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={styles.dashboardLabel}>Αναζήτηση ΑΜΚΑ:</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
        <TextInput style={styles.searchInput} placeholderTextColor={COLORS.primary} keyboardType="numeric" />
      </View>

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <Text style={styles.dashboardTitle}>Ειδοποιήσεις</Text>
        <Text style={[sharedStyles.emptyText, { marginTop: 10, textAlign: 'left' }]}>Δεν υπάρχουν ειδοποιήσεις αυτή τη στιγμή.</Text>
      </View>
    </SafeAreaView>
  );
}
