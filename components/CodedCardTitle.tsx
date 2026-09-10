import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY } from '../constants/designSystem';
import { doctorStyles } from '../constants/doctorStyles';

interface Props {
  code?: string;
  title: string;
  parentName?: string;
}

// Ο τίτλος μιας κάρτας ιστορικού με τον επίσημο κωδικό μπροστά και, από κάτω, την κατηγορία
// στην οποία ανήκει. Τα υποεπίπεδα των προτύπων γράφονται συντομογραφικά και δεν στέκουν μόνα
// τους: το "C41.1 Κάτω γνάθος" σημαίνει κακοήθες νεόπλασμα κάτω γνάθου.
export function CodedCardTitle({ code, title, parentName }: Props) {
  return (
    <View style={{ flex: 1, marginRight: 10 }}>
      <Text style={[doctorStyles.diagnosisCardTitle, { flex: 0, marginRight: 0 }]}>
        {!!code && <Text style={localStyles.code}>{code}  </Text>}
        {title}
      </Text>
      {!!parentName && <Text style={localStyles.parentName}>({parentName})</Text>}
    </View>
  );
}

const localStyles = StyleSheet.create({
  code: { color: COLORS.primary },
  // Δευτερεύον κείμενο (14px) και όχι ετικέτα (12px): είναι περιεχόμενο που διαβάζει και
  // ο ασθενής, όχι επιγραφή πεδίου.
  parentName: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2 },
});
