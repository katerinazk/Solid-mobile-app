import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { SPACING } from '../../../constants/designSystem';
import { PatientHeader } from '../../../components/patient/PatientHeader';
import { useAuth } from '../../../hooks/useAuth';

export default function PatientSettingsScreen() {
  const { confirmLogout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
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
