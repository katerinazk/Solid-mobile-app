import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';
import { Dialog, setDialogHandler } from '../utils/appMessage';

/**
 * Τα παράθυρα διαλόγου της εφαρμογής, σε ένα αντίτυπο στη ρίζα.
 *
 * Μπαίνουν σε ουρά: αν δύο ενέργειες στείλουν διάλογο η μία μετά την άλλη, ο δεύτερος
 * περιμένει αντί να σβήσει τον πρώτο πριν προλάβει να διαβαστεί.
 */
export function AppMessageHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);

  useEffect(() => {
    setDialogHandler((dialog) => setQueue((prev) => [...prev, dialog]));
    return () => setDialogHandler(null);
  }, []);

  const current = queue[0];

  // Κλείνοντας μια ερώτηση απαντάμε πάντα κάτι: αλλιώς η ροή που περιμένει δεν συνεχίζει ποτέ.
  const close = useCallback((confirmed: boolean) => {
    setQueue((prev) => {
      const [first, ...rest] = prev;
      if (first?.kind === 'confirm') first.resolve(confirmed);
      return rest;
    });
  }, []);

  return (
    <Modal animationType="fade" transparent visible={current !== undefined} onRequestClose={() => close(false)}>
      <View style={localStyles.overlay}>
        <View style={localStyles.panel}>
          <Text style={localStyles.message}>
            {current?.kind === 'confirm' ? current.options.message : current?.message}
          </Text>

          {current?.kind === 'confirm' ? (
            <View style={localStyles.buttonRow}>
              <TouchableOpacity style={localStyles.cancelButton} onPress={() => close(false)} accessibilityRole="button">
                <Text style={localStyles.cancelButtonText}>{current.options.cancelText || 'Όχι'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.confirmButton} onPress={() => close(true)} accessibilityRole="button">
                <Text style={localStyles.confirmButtonText}>{current.options.confirmText || 'Ναι'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={localStyles.okButton} onPress={() => close(true)} accessibilityRole="button" accessibilityLabel="OK">
              <Text style={localStyles.okButtonText}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  // Μικρό παράθυρο, ίδιο κέλυφος με τα υπόλοιπα της εφαρμογής.
  panel: {
    width: '80%',
    backgroundColor: COLORS.lightest,
    borderRadius: 15,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  // Μπλε γράμματα πάνω στην ανοιχτή επιφάνεια: αντίθεση 7.03:1, πάνω από το 4.5:1 του WCAG.
  message: {
    fontSize: TYPOGRAPHY.bodyText,
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: SPACING.sectionGap,
  },
  // Μία μόνο ενέργεια, στρογγυλή και κεντραρισμένη, όπως τα υπόλοιπα κουμπιά.
  okButton: {
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: '50%',
    alignSelf: 'center',
  },
  okButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText },
  // Δύο ενέργειες: η ακύρωση περιγραμμένη, η συνέχεια γεμάτη. Ίδιο ζευγάρι μορφών με τα
  // κουμπιά επιλογής τύπου πρόσβασης.
  buttonRow: { flexDirection: 'row', gap: TOUCH.buttonGap },
  cancelButton: {
    flex: 1,
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  cancelButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText, textAlign: 'center' },
  confirmButton: {
    flex: 1,
    minHeight: TOUCH.buttonHeight,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  confirmButtonText: { color: COLORS.white, fontWeight: 'bold', fontSize: TYPOGRAPHY.bodyText, textAlign: 'center' },
});
