import React, { useRef, useState } from 'react';
import { Text, View, TouchableOpacity, Modal, StyleSheet, StyleProp, ViewStyle } from 'react-native';
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
 * Το φίλτρο νεότερα/παλαιότερα ως πραγματικό dropdown: πατώντας ανοίγει λίστα με τις δύο
 * επιλογές αντί να εναλλάσσεται με κάθε πάτημα του ίδιου κουμπιού.
 *
 * Ζωγραφίζεται σε Modal (ξεχωριστό επίπεδο πάνω από όλα) στη θέση του κουμπιού τη στιγμή που
 * πατήθηκε (measureInWindow), όπως ακριβώς το φίλτρο τύπου πρόσβασης στις Προσβάσεις - το
 * κουμπί ζει συνήθως μέσα σε ListHeaderComponent, όπου ένα απλό position:absolute θα κοβόταν
 * στα όρια της λίστας.
 */
export function SortDropdown({ value, onChange, newestLabel, oldestLabel, style }: Props) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const buttonRef = useRef<View>(null);

  const openDropdown = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      setLayout({ x, y, width, height });
      setOpen(true);
    });
  };

  const options: { label: string; val: boolean }[] = [
    { label: newestLabel, val: true },
    { label: oldestLabel, val: false },
  ];

  return (
    <>
      <TouchableOpacity ref={buttonRef} style={[localStyles.button, style]} onPress={openDropdown}>
        <Text style={localStyles.buttonText}>{value ? newestLabel : oldestLabel}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.white} style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setOpen(false)}>
          <View
            style={[
              localStyles.dropdown,
              { position: 'absolute', top: layout.y + layout.height + SPACING.groupGap, left: layout.x, width: layout.width },
            ]}
          >
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
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const localStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    minHeight: TOUCH.buttonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    marginHorizontal: SPACING.sideMargin,
    marginBottom: TOUCH.buttonGap,
  },
  buttonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  dropdown: {
    minWidth: 220,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: TOUCH.minTargetSize, paddingHorizontal: 14 },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.lightest },
  optionText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  optionTextSelected: { color: COLORS.primary, fontWeight: 'bold' },
});
