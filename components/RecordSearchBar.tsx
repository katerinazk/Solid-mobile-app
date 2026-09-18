import React from 'react';
import { Text, View, TextInput, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { doctorStyles } from '../constants/doctorStyles';
import { SPACING } from '../constants/designSystem';

/**
 * Το πεδίο αναζήτησης των οθονών ιστορικού, ίδιο σε όλες τις κατηγορίες.
 *
 * Δεν αποφασίζει μόνο του αν θα φανεί: το "visible" το δίνει η οθόνη, από το useRecordSearch,
 * ώστε το όριο των εγγραφών να κρίνεται στο ίδιο σημείο όπου γίνεται και το φιλτράρισμα.
 */
export function RecordSearchBar({ label, value, onChange, visible, containerStyle }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  visible: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  if (!visible) return null;

  return (
    <View style={containerStyle ?? { width: '70%', alignSelf: 'center', marginTop: SPACING.sectionGap, marginBottom: SPACING.groupGap }}>
      <Text style={doctorStyles.dashboardLabel}>{label}</Text>
      <View style={[doctorStyles.searchContainer, { marginHorizontal: 0 }]}>
        <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
        <TextInput
          style={doctorStyles.searchInput}
          placeholder="Αναζήτηση..."
          placeholderTextColor={COLORS.primary}
          value={value}
          onChangeText={onChange}
        />
      </View>
    </View>
  );
}
