import React from 'react';
import { Text, View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Dropdown } from 'react-native-element-dropdown';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';
import { ACCESS_TYPES } from '../constants/accessTypes';

const ACCESS_TYPE_OPTIONS = ACCESS_TYPES.map((type) => ({ label: type, value: type }));

interface AccessCardProps {
  item: any;
  savingChange: { amka: string; type: string } | null;
  savedTypeAmkas: string[];
  // ΑΜΚΑ του γιατρού που καταργείται αυτή τη στιγμή, αν υπάρχει - το κουμπί "Κατάργηση"
  // μπλοκάρεται όσο διαρκεί, ώστε ένα δεύτερο πάτημα να μη στείλει διπλό αίτημα.
  deletingAmka?: string | null;
  onSelectType: (doctorAmka: string, newType: string) => void;
  onDelete: (doctorAmka: string) => void;
}

/**
 * Η κάρτα ενός γιατρού που έχει ήδη πρόσβαση. Χρησιμοποιείται και στη λίστα προσβάσεων και
 * μέσα στα αποτελέσματα αναζήτησης της οθόνης "Προσθήκη Πρόσβασης", όταν ο γιατρός που βρέθηκε
 * έχει ήδη πρόσβαση - ο ασθενής αλλάζει τον τύπο επιτόπου αντί να ψάχνει πάλι τη λίστα.
 */
export function AccessCard({ item, savingChange, savedTypeAmkas, deletingAmka, onSelectType, onDelete }: AccessCardProps) {
  const deleting = deletingAmka === item.doctor_amka;
  return (
    <View style={styles.card}>
      <Text style={styles.doctorName}>
        Δρ. {item.doctors?.last_name} {item.doctors?.first_name}
      </Text>
      <Text style={styles.specialty}>{item.doctors?.specialty}</Text>

      <View style={styles.typeRow}>
        <Text style={styles.typeLabel}>Τύπος πρόσβασης:</Text>

        <Dropdown
          style={[styles.typeField, savedTypeAmkas.includes(item.doctor_amka) && styles.typeFieldSaved]}
          containerStyle={styles.typeFieldList}
          selectedTextStyle={[styles.typeFieldText, savedTypeAmkas.includes(item.doctor_amka) && styles.typeFieldTextSaved]}
          itemTextStyle={styles.typeFieldItemText}
          selectedTextProps={{ numberOfLines: 1 }}
          activeColor={COLORS.lightest}
          maxHeight={220}
          data={ACCESS_TYPE_OPTIONS}
          labelField="label"
          valueField="value"
          value={item.access_type}
          disable={!!savingChange}
          onChange={(option) => onSelectType(item.doctor_amka, option.value)}
          renderRightIcon={() =>
            savingChange?.amka === item.doctor_amka ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : savedTypeAmkas.includes(item.doctor_amka) ? (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
            ) : (
              <Ionicons name="chevron-down" size={18} color={COLORS.primary} />
            )
          }
        />
      </View>

      {savingChange?.amka === item.doctor_amka && (
        <Text style={styles.statusText}>Αποθήκευση αλλαγής...</Text>
      )}
      {savedTypeAmkas.includes(item.doctor_amka) && (
        <Text style={[styles.statusText, { color: COLORS.success, fontWeight: 'bold' }]}>Η αλλαγή αποθηκεύτηκε</Text>
      )}

      <TouchableOpacity style={styles.removeButton} onPress={() => onDelete(item.doctor_amka)} disabled={deleting}>
        {deleting ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.removeButtonText}>Κατάργηση</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.lightest, borderRadius: 15, padding: 16, marginHorizontal: SPACING.sideMargin, marginBottom: 12 },
  doctorName: { fontSize: TYPOGRAPHY.subtitle, fontWeight: 'bold', color: COLORS.primary },
  specialty: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2, marginBottom: SPACING.groupGap },
  typeLabel: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  // Το πεδίο επιλογής είναι γεμάτο κουμπί, στο χρώμα της εφαρμογής. Μόλις αποθηκευτεί μια
  // αλλαγή, γεμίζει πράσινο: η επιβεβαίωση φαίνεται από απόσταση, όχι σε μια λεπτή γραμμή.
  typeRow: { flexDirection: 'row', alignItems: 'center' },
  typeField: {
    flex: 1,
    marginLeft: SPACING.groupGap,
    height: TOUCH.minTargetSize,
    backgroundColor: COLORS.light,
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  typeFieldSaved: { backgroundColor: COLORS.success },
  typeFieldText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, fontWeight: '600' },
  typeFieldTextSaved: { color: COLORS.white },
  typeFieldList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.medium,
    backgroundColor: COLORS.white,
  },
  typeFieldItemText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  statusText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 6 },
  removeButton: { backgroundColor: COLORS.danger, minHeight: TOUCH.buttonHeight, borderRadius: 25, justifyContent: 'center', alignItems: 'center', width: '60%', alignSelf: 'center', marginTop: SPACING.groupGap },
  removeButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
});
