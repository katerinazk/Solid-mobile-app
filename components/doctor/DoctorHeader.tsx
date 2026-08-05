import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { doctorStyles as styles } from '../../constants/doctorStyles';
import { useAuth } from '../../hooks/useAuth';
import { useDoctorMenu } from '../../hooks/useDoctorMenu';

export function DoctorHeader() {
  const { confirmLogout } = useAuth();
  const { openMenu } = useDoctorMenu();

  return (
    <View style={styles.docHeader}>
      <TouchableOpacity onPress={openMenu}>
        <Feather name="menu" size={28} color={COLORS.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={confirmLogout}>
        <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
