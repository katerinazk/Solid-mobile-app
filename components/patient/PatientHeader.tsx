import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { sharedStyles as styles } from '../../constants/sharedStyles';
import { ROUTES } from '../../constants/routes';

// Χωρίς πλαϊνό μενού: η πλοήγηση γίνεται από τις καρτέλες στο κάτω μέρος της οθόνης, οπότε
// στην κεφαλίδα μένει μόνο το προφίλ, στοιχισμένο δεξιά.
export function PatientHeader() {
  return (
    <View style={[styles.header, { justifyContent: 'flex-end' }]}>
      <TouchableOpacity onPress={() => router.push(ROUTES.PATIENT_PROFILE)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="person-circle-outline" size={38} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
