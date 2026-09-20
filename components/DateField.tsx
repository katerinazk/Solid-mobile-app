import React, { useState } from 'react';
import { Text, View, TouchableOpacity, Modal, Platform, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS } from '../constants/colors';
import { sharedStyles } from '../constants/sharedStyles';
import { loginStyles } from '../constants/loginStyles';
import { TYPOGRAPHY, SPACING } from '../constants/designSystem';
import { formStyles } from './RecordFormScreen';
import { isoToDate, dateToIso } from '../utils/dateInput';

interface Props {
  label: string;
  // Οι ιατρικές φόρμες και η οθόνη του λογαριασμού γράφουν αλλιώς ετικέτες και πεδία.
  labelStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  // 'ΕΕΕΕ-ΜΜ-ΗΗ' ή κενό όσο δεν έχει επιλεγεί τίποτα.
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

// Επιλογή ημερομηνίας από ημερολόγιο αντί για πληκτρολόγηση. Το ιστορικό πιάνει δεκαετίες
// (παιδικά εμβόλια, παλιές νοσηλίες), οπότε το ημερολόγιο ανοίγει στην τελευταία επιλογή του
// γιατρού και όχι πάντα στο σήμερα - αλλιώς θα χρειαζόταν δεκάδες κυλήσεις κάθε φορά.
export function DateField({ label, labelStyle, inputStyle, value, onChange, minimumDate, maximumDate }: Props) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const selectedDate = isoToDate(value) || new Date();

  const handleChange = (event: any, date?: Date) => {
    // Στο Android το ημερολόγιο είναι δικός του διάλογος: κλείνει μόνο του και μας λέει αν ο
    // χρήστης πάτησε ΟΚ ή ακύρωση. Στο iOS μένει ανοιχτό μέχρι να πατηθεί το "Εντάξει".
    if (Platform.OS === 'android') {
      setIsPickerVisible(false);
      if (event?.type !== 'set' || !date) return;
    }

    if (date) onChange(dateToIso(date));
  };

  const picker = (
    <DateTimePicker
      value={selectedDate}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={handleChange}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
    />
  );

  return (
    <View>
      <Text style={labelStyle ?? loginStyles.inputLabel}>{label}</Text>

      <TouchableOpacity
        style={[loginStyles.loginInput, formStyles.input, inputStyle, localStyles.field]}
        onPress={() => setIsPickerVisible(true)}
      >
        <Text style={[localStyles.valueText, !value && { color: COLORS.medium }]}>
          {value ? formatIsoForDisplay(value) : 'Επιλέξτε ημερομηνία'}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
      </TouchableOpacity>

      {isPickerVisible && Platform.OS === 'android' && picker}

      {Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible={isPickerVisible} onRequestClose={() => setIsPickerVisible(false)}>
          <View style={sharedStyles.addmodalOverlay}>
            <View style={sharedStyles.addmodalContent}>
              <Text style={sharedStyles.addmodalTitle}>{label}</Text>
              {picker}
              <TouchableOpacity
                style={[sharedStyles.addButton, { borderRadius: 25, marginBottom: 0, marginTop: SPACING.groupGap }]}
                onPress={() => setIsPickerVisible(false)}
              >
                <Text style={sharedStyles.addButtonText}>Εντάξει</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// 'ΕΕΕΕ-ΜΜ-ΗΗ' -> 'ΗΗ/ΜΜ/ΕΕΕΕ', χωρίς να περάσει από Date: η ημερομηνία είναι ήδη σωστή και
// μια μετατροπή σε Date θα έμπλεκε ζώνες ώρας.
function formatIsoForDisplay(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

const localStyles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valueText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
});
