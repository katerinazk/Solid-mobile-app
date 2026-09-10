import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { COLORS } from '../constants/colors';
import { loginStyles } from '../constants/loginStyles';
import { TYPOGRAPHY } from '../constants/designSystem';
import { formStyles } from './DoctorFormScreen';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
}

// Επιλογή από κλειστή λίστα. Δεν χρησιμοποιούμε το Picker του συστήματος: εμφανίζεται
// διαφορετικά σε Android και iOS και δεν ακολουθεί τα χρώματα της εφαρμογής. Η λίστα ανοίγει
// κάτω από το πεδίο, όπως ακριβώς τα αποτελέσματα της αναζήτησης στους καταλόγους.
export function SelectField({ label, value, onChange, options, placeholder = 'Επιλέξτε...', inputStyle }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View>
      <Text style={loginStyles.inputLabel}>{label}</Text>

      <TouchableOpacity
        style={[loginStyles.loginInput, formStyles.input, inputStyle, { justifyContent: 'center', marginBottom: isOpen ? 0 : 30 }]}
        onPress={() => setIsOpen((prev) => !prev)}
      >
        <Text style={{ color: value ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>

      {isOpen && (
        <View style={localStyles.list}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={option}
              style={[localStyles.option, index === options.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { onChange(option); setIsOpen(false); }}
            >
              <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  list: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    marginBottom: 30,
    overflow: 'hidden',
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightest,
  },
});
