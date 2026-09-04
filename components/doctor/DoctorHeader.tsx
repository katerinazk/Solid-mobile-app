import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { doctorStyles as styles } from '../../constants/doctorStyles';
import { ROUTES } from '../../constants/routes';

export function DoctorHeader() {
  return (
    <View style={[styles.docHeader, { justifyContent: 'flex-end' }]}>
      <TouchableOpacity onPress={() => router.push(ROUTES.DOCTOR_PROFILE)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
