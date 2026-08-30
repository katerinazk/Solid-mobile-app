import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { doctorStyles as styles } from '../../constants/doctorStyles';
import { ROUTES } from '../../constants/routes';
import { useDoctorMenu } from '../../hooks/useDoctorMenu';

export function DoctorHeader() {
  const { openMenu } = useDoctorMenu();

  return (
    <View style={styles.docHeader}>
      <TouchableOpacity onPress={openMenu} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Feather name="menu" size={28} color={COLORS.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push(ROUTES.DOCTOR_PROFILE)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
