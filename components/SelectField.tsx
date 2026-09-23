import React, { useState } from 'react';
import { Text, View, TouchableOpacity, ScrollView, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { loginStyles } from '../constants/loginStyles';
import { TYPOGRAPHY } from '../constants/designSystem';
import { formStyles } from './RecordFormScreen';

interface Props {
  label: string;
  // Η οθόνη του λογαριασμού γράφει τις ετικέτες της αλλιώς από τις ιατρικές φόρμες.
  labelStyle?: StyleProp<TextStyle>;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
}

// Επιλογή από κλειστή λίστα. Δεν χρησιμοποιούμε το Picker του συστήματος: εμφανίζεται
// διαφορετικά σε Android και iOS και δεν ακολουθεί τα χρώματα της εφαρμογής. Η λίστα ανοίγει
// κάτω από το πεδίο, όπως ακριβώς τα αποτελέσματα της αναζήτησης στους καταλόγους.
export function SelectField({ label, labelStyle, value, onChange, options, placeholder = 'Επιλέξτε...', inputStyle }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View>
      <Text style={labelStyle ?? loginStyles.inputLabel}>{label}</Text>

      <TouchableOpacity
        style={[loginStyles.loginInput, formStyles.input, inputStyle, localStyles.field, { marginBottom: isOpen ? 0 : 30 }]}
        onPress={() => setIsOpen((prev) => !prev)}
      >
        <Text style={{ color: value ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
          {value || placeholder}
        </Text>
        {/* Δείχνει ότι το πάτημα ανοίγει λίστα από κάτω - χωρίς αυτό δεν ξεχώριζε από απλό πεδίο κειμένου. */}
        <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
      </TouchableOpacity>

      {isOpen && (
        // Οι ειδικότητες είναι σχεδόν σαράντα: χωρίς όριο ύψους η λίστα θα έσπρωχνε το κουμπί
        // αποθήκευσης δύο οθόνες πιο κάτω.
        <ScrollView style={localStyles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((option, index) => (
            <TouchableOpacity
              key={option}
              style={[localStyles.option, index === options.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { onChange(option); setIsOpen(false); }}
            >
              <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{option}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    marginBottom: 30,
    maxHeight: 260,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightest,
  },
});
