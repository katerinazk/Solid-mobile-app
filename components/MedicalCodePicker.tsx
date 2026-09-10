import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY } from '../constants/designSystem';
import { CatalogPicker } from './CatalogPicker';
import { searchMedicalCodes, MedicalCode, MedicalCodeCategory } from '../services/medicalCodes';

interface Props {
  category: MedicalCodeCategory;
  value: MedicalCode | null;
  onChange: (code: MedicalCode | null) => void;
  placeholder?: string;
  inputStyle?: StyleProp<TextStyle>;
  multiline?: boolean;
  resultsMaxHeight?: number;
}

// Επιλογή από τον κατάλογο προτύπων (ICD-10 / ATC / LOINC) αντί για ελεύθερο κείμενο, ώστε
// η καταχώρηση να έχει πάντα επίσημο κωδικό.
export function MedicalCodePicker({ category, value, onChange, placeholder, inputStyle, multiline, resultsMaxHeight }: Props) {
  return (
    <CatalogPicker<MedicalCode>
      search={(query) => searchMedicalCodes(category, query)}
      value={value}
      onChange={onChange}
      keyOf={(item) => String(item.id)}
      placeholder={placeholder}
      inputStyle={inputStyle}
      multiline={multiline}
      resultsMaxHeight={resultsMaxHeight}
      renderRow={(item) => (
        <>
          <Text style={localStyles.code}>{item.code}</Text>
          <Text style={localStyles.name}>{item.name}</Text>
          {!!item.parent_name && <Text style={localStyles.parentName}>({item.parent_name})</Text>}
        </>
      )}
      renderSelected={(item) => (
        <>
          <Text style={localStyles.code}>{item.code}</Text>
          <Text style={localStyles.selectedName}>{item.name}</Text>
          {!!item.parent_name && <Text style={localStyles.parentName}>({item.parent_name})</Text>}
        </>
      )}
    />
  );
}

const localStyles = StyleSheet.create({
  code: { fontSize: TYPOGRAPHY.label, fontWeight: 'bold', color: COLORS.primary },
  name: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginTop: 2 },
  selectedName: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 2 },

  // Το συμφραζόμενο του γονέα. Δευτερεύον κείμενο (14px) και όχι ετικέτα (12px): είναι
  // περιεχόμενο που διαβάζει και ο ασθενής, όχι επιγραφή πεδίου.
  parentName: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2 },
});
