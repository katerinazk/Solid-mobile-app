import React from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../../../constants/designSystem';
import { ROUTES } from '../../../constants/routes';
import { PatientHeader } from '../../../components/patient/PatientHeader';

export default function PatientSettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />

      <View style={{ paddingHorizontal: SPACING.sideMargin }}>
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: TOUCH.minTargetSize,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.medium,
          }}
          onPress={() => router.push(ROUTES.PATIENT_CLEANUP)}
        >
          <Ionicons name="trash-outline" size={22} color={COLORS.primary} style={{ marginRight: 12 }} />
          <Text style={{ flex: 1, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text }}>
            Εκκαθάριση παλιών καταχωρήσεων
          </Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
