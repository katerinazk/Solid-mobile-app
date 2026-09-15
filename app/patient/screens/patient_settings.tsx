import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { PatientHeader } from '../../../components/patient/PatientHeader';
import { useAuth } from '../../../hooks/useAuth';

export default function PatientSettingsScreen() {
  const { confirmLogout, confirmSwitchPod } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <TouchableOpacity style={localStyles.secondaryButton} onPress={confirmSwitchPod}>
          <Ionicons name="swap-horizontal-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
          <Text style={localStyles.secondaryButtonText}>Σύνδεση με άλλο Pod</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addButton, { borderRadius: 25, flexDirection: 'row', marginBottom: 0 }]}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
          <Text style={styles.addButtonText}>Αποσύνδεση</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  // Δευτερεύουσα ενέργεια: περιγραμμένη αντί για γεμάτη, ώστε να μην ανταγωνίζεται οπτικά
  // την αποσύνδεση ακριβώς από κάτω.
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.groupGap,
  },
  secondaryButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
