import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { SPACING } from '../../../constants/designSystem';
import { DoctorHeader } from '../../../components/doctor/DoctorHeader';
import { useAuth } from '../../../hooks/useAuth';

export default function DoctorSettingsScreen() {
  const { confirmLogout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />

      <Text style={[sharedStyles.emptyText, { marginTop: 50 }]}>Η λειτουργία έρχεται σύντομα.</Text>

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin }}>
        <TouchableOpacity
          style={[sharedStyles.addButton, { borderRadius: 25, flexDirection: 'row', marginBottom: 0 }]}
          onPress={confirmLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
          <Text style={sharedStyles.addButtonText}>Αποσύνδεση</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
