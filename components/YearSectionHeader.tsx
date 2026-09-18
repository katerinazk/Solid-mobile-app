import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING } from '../constants/designSystem';

// Ο τίτλος χρονιάς πάνω από κάθε ομάδα εγγραφών. Μένει κολλημένος στην κορυφή όσο κυλάει η
// ομάδα του, γι' αυτό έχει ΑΔΙΑΦΑΝΕΣ φόντο ίδιο με της οθόνης: αλλιώς οι κάρτες θα φαίνονταν
// να περνούν από πίσω του.
export function YearSectionHeader({ title }: { title: string }) {
  return (
    <View style={localStyles.wrapper}>
      <Text style={localStyles.text}>{title}</Text>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: COLORS.light,
    paddingHorizontal: SPACING.sideMargin,
    paddingTop: SPACING.groupGap,
    paddingBottom: SPACING.groupGap,
  },
  text: {
    fontSize: TYPOGRAPHY.bodyText,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
});
