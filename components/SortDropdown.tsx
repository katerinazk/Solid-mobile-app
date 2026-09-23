import React, { useState } from 'react';
import { Text, View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';

interface Props {
  /** true = νεότερα πρώτα, false = παλαιότερα πρώτα. */
  value: boolean;
  onChange: (value: boolean) => void;
  newestLabel: string;
  oldestLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Το φίλτρο νεότερα/παλαιότερα ως πραγματικό dropdown: πατώντας ανοίγει η λίστα επιλογών ΚΑΤΩ
 * από το κουμπί, μέσα στη ροή της σελίδας - σπρώχνει το περιεχόμενο από κάτω, δεν επιπλέει
 * από πάνω του. Χωρίς Modal/measureInWindow (όπως το φίλτρο τύπου πρόσβασης στις Προσβάσεις),
 * γιατί εδώ δεν χρειάζεται να "ξεφύγει" από τα όρια κάποιου scroll container.
 */
export function SortDropdown({ value, onChange, newestLabel, oldestLabel, style }: Props) {
  const [open, setOpen] = useState(false);

  const options: { label: string; val: boolean }[] = [
    { label: newestLabel, val: true },
    { label: oldestLabel, val: false },
  ];

  return (
    <View style={[localStyles.container, style]}>
      <TouchableOpacity style={localStyles.button} onPress={() => setOpen((prev) => !prev)}>
        <Text style={localStyles.buttonText}>{value ? newestLabel : oldestLabel}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.white} style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {open && (
        <View style={localStyles.dropdown}>
          {options.map((option, index) => (
            <TouchableOpacity
              key={option.label}
              style={[localStyles.option, index < options.length - 1 && localStyles.optionBorder]}
              onPress={() => { onChange(option.val); setOpen(false); }}
            >
              <Text style={[localStyles.optionText, option.val === value && localStyles.optionTextSelected]}>{option.label}</Text>
              {option.val === value && <Ionicons name="checkmark" size={16} color={COLORS.primary} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.sideMargin,
    marginBottom: TOUCH.buttonGap,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    minHeight: TOUCH.buttonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
  },
  buttonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  dropdown: {
    marginTop: SPACING.groupGap,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 15,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: TOUCH.minTargetSize, paddingHorizontal: 14 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.lightest },
  optionText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  optionTextSelected: { color: COLORS.primary, fontWeight: 'bold' },
});
