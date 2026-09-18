import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING } from '../constants/designSystem';
import { Retraction } from '../utils/recordRevision';
import { formatDate } from '../utils/age';

/**
 * Το ύφος της κάρτας μιας ανακληθείσας εγγραφής: μένει ορατή αλλά σβησμένη, ώστε να ξεχωρίζει
 * με μια ματιά από όσες ισχύουν, χωρίς να κρύβεται.
 */
export const retractedCardStyle = { opacity: 0.55 };

/** Η ένδειξη μέσα στην κάρτα: ποιος ανακάλεσε την εγγραφή, πότε και γιατί. */
export function RetractedNote({ retraction }: { retraction?: Retraction }) {
  if (!retraction) return null;

  return (
    <View style={localStyles.container}>
      <View style={localStyles.titleRow}>
        <Ionicons name="close-circle-outline" size={18} color={COLORS.danger} style={{ marginRight: 6 }} />
        <Text style={localStyles.title}>
          Ανακλήθηκε{retraction.at ? ` στις ${formatDate(retraction.at)}` : ''}
        </Text>
      </View>

      {!!retraction.reason && (
        <Text style={localStyles.detail}>
          <Text style={localStyles.label}>Αιτία: </Text>{retraction.reason}
        </Text>
      )}

      {!!retraction.byName && (
        <Text style={localStyles.detail}>
          <Text style={localStyles.label}>Από: </Text>{retraction.byName}
        </Text>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  // Χωρισμένη με γραμμή από το περιεχόμενο της εγγραφής: η ανάκληση είναι σχόλιο ΠΑΝΩ στην
  // εγγραφή, δεν είναι ένα ακόμα στοιχείο της.
  container: {
    marginTop: SPACING.groupGap,
    paddingTop: SPACING.groupGap,
    borderTopWidth: 1,
    borderTopColor: COLORS.medium,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: 'bold', color: COLORS.danger },
  detail: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginTop: 2 },
  label: { fontWeight: 'bold', color: COLORS.primary },
});
