import React from 'react';
import { Text, ActivityIndicator, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING } from '../constants/designSystem';

/**
 * Η οθόνη όσο διαρκεί η σύνδεση με το Pod: από τη στιγμή που ανοίγει ο browser για τα
 * στοιχεία του χρήστη μέχρι να μάθουμε αν συνδέθηκε επιτυχώς.
 *
 * Αντικαθιστά ολόκληρη τη φόρμα σύνδεσης αντί να μείνει αυτή ορατή με ένα γεμάτο κουμπί: πριν
 * απ' αυτό, μόλις έκλεινε ο browser η φόρμα φαινόταν ξανά κανονική - σαν να μην είχε γίνει
 * τίποτα - ενώ στο παρασκήνιο έτρεχε ακόμα η ανταλλαγή του κωδικού με token και ο έλεγχος στη
 * βάση. Ο χρήστης μπορούσε να ξαναπατήσει "Είσοδος" πάνω σε μια σύνδεση που ήδη εξελισσόταν.
 */
export function AuthLoadingScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.title}>Σύνδεση με το Pod</Text>
      <Text style={styles.subtitle}>
        Περιμένουμε την επιβεβαίωση από τον πάροχο του Pod σας.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sideMargin,
  },
  title: {
    marginTop: SPACING.sectionGap,
    fontSize: TYPOGRAPHY.subtitle,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    marginTop: SPACING.groupGap,
    fontSize: TYPOGRAPHY.secondaryText,
    color: COLORS.text,
    textAlign: 'center',
  },
});
