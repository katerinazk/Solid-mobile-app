import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

/**
 * Τα εικονίδια ενέργειας πάνω δεξιά σε μια κάρτα ιστορικού: διόρθωση και ανάκληση.
 *
 * Δεν υπάρχει διαγραφή. Η ανάκληση ΔΕΝ σβήνει την εγγραφή - τη σημαίνει ως αποσυρμένη και
 * την αφήνει ορατή, γι' αυτό και το εικονίδιο είναι κύκλος με χ και όχι κάδος: ο κάδος
 * υπόσχεται εξαφάνιση.
 *
 * Το "visible" το κρίνει η οθόνη, επειδή ο κανόνας αλλάζει ανά περίπτωση - πάντα όμως
 * περιλαμβάνει ότι ενεργεί ο ΣΥΝΤΑΚΤΗΣ της εγγραφής και ότι δεν έχει ήδη ανακληθεί.
 */
export function RecordCardActions({ visible, onEdit, onRetract }: {
  visible: boolean;
  /** Παραλείπεται στις κατηγορίες που δεν επιτρέπουν διόρθωση. */
  onEdit?: () => void;
  onRetract: () => void;
}) {
  if (!visible) return null;

  return (
    <View style={{ flexDirection: 'row' }}>
      {!!onEdit && (
        <TouchableOpacity onPress={onEdit} style={{ marginRight: 15 }} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Διόρθωση εγγραφής">
          <Ionicons name="pencil-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onRetract} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel="Ανάκληση εγγραφής">
        <Ionicons name="close-circle-outline" size={22} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}
