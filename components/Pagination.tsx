import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';

interface Props {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

// Πόσοι αριθμοί σελίδων φαίνονται ταυτόχρονα. Με περισσότερες σελίδες, το παράθυρο
// μετακινείται γύρω από την τρέχουσα αντί να ξεχειλίζει η γραμμή.
const MAX_VISIBLE_PAGES = 5;

function visiblePages(page: number, pageCount: number): number[] {
  if (pageCount <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const end = Math.min(pageCount, Math.max(page + Math.floor(MAX_VISIBLE_PAGES / 2), MAX_VISIBLE_PAGES));
  const start = Math.max(1, end - MAX_VISIBLE_PAGES + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/**
 * Οι σελίδες μιας λίστας ιστορικού: βελάκια για προηγούμενη/επόμενη και οι αριθμοί ανάμεσα.
 * Με μία μόνο σελίδα δεν εμφανίζεται τίποτα.
 */
export function Pagination({ page, pageCount, onChange }: Props) {
  if (pageCount <= 1) return null;

  const pages = visiblePages(page, pageCount);

  return (
    <View style={localStyles.row}>
      <TouchableOpacity
        style={localStyles.arrow}
        onPress={() => onChange(page - 1)}
        disabled={page === 1}
        accessibilityRole="button"
        accessibilityLabel="Προηγούμενη σελίδα"
      >
        <Ionicons name="chevron-back" size={20} color={page === 1 ? COLORS.medium : COLORS.primary} />
      </TouchableOpacity>

      {pages.map((number) => (
        <TouchableOpacity
          key={number}
          style={[localStyles.page, number === page && localStyles.pageSelected]}
          onPress={() => onChange(number)}
          accessibilityRole="button"
          accessibilityLabel={`Σελίδα ${number}`}
        >
          <Text style={[localStyles.pageText, number === page && localStyles.pageTextSelected]}>{number}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={localStyles.arrow}
        onPress={() => onChange(page + 1)}
        disabled={page === pageCount}
        accessibilityRole="button"
        accessibilityLabel="Επόμενη σελίδα"
      >
        <Ionicons name="chevron-forward" size={20} color={page === pageCount ? COLORS.medium : COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

const localStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.groupGap,
    marginBottom: SPACING.groupGap,
  },
  arrow: {
    width: TOUCH.minTargetSize,
    height: TOUCH.minTargetSize,
    justifyContent: 'center',
    alignItems: 'center',
  },
  page: {
    minWidth: TOUCH.minTargetSize,
    height: TOUCH.minTargetSize,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: TOUCH.minTargetSize / 2,
    marginHorizontal: 2,
  },
  pageSelected: { backgroundColor: COLORS.primary },
  pageText: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.primary, fontWeight: '600' },
  pageTextSelected: { color: COLORS.white, fontWeight: 'bold' },
});
