import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { ROUTES } from '../../constants/routes';
import { usePatientMenu } from '../../hooks/usePatientMenu';

export function PatientHeader() {
  const { openMenu } = usePatientMenu();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={openMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Feather name="menu" size={28} color={COLORS.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push(ROUTES.PATIENT_PROFILE)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
