import React, { ReactNode, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { SPACING, TOUCH } from '../constants/designSystem';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Οριζόντια λωρίδα φίλτρων που δηλώνει προς ποια μεριά συνεχίζεται.
 *
 * Τα φίλτρα είναι περισσότερα από όσα χωρούν στην οθόνη, αλλά τίποτα δεν το πρόδιδε: η λωρίδα
 * τελείωνε καθαρά στην άκρη και έμοιαζε πλήρης. Πλέον σε κάθε άκρη εμφανίζεται βελάκι, μόνο
 * όσο υπάρχει κάτι παραπέρα προς τα εκεί, και πατώντας το κυλά η λωρίδα.
 *
 * Τα βελάκια επιπλέουν πάνω από τη λωρίδα αντί να πιάνουν δική τους θέση δίπλα της: έτσι τα
 * φίλτρα κρατούν ολόκληρο το πλάτος της οθόνης. Καλύπτουν μόνο ό,τι βρίσκεται στις άκρες,
 * που είναι έτσι κι αλλιώς κομμένο τη στιγμή που φαίνεται το αντίστοιχο βελάκι.
 */
export function FilterScrollRow({ children, style, contentContainerStyle }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  // Μικρή ανοχή: το τελευταίο εικονοστοιχείο σπάνια πέφτει ακριβώς στο μηδέν.
  const canScrollLeft = offset > 4;
  const canScrollRight = contentWidth - viewportWidth - offset > 4;

  const scrollBy = (direction: 1 | -1) => {
    scrollRef.current?.scrollTo({ x: offset + direction * viewportWidth * 0.7, animated: true });
  };

  return (
    <View style={style}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        contentContainerStyle={contentContainerStyle}
        style={localStyles.scroll}
      >
        {children}
      </ScrollView>

      {canScrollLeft && (
        <TouchableOpacity
          style={[localStyles.arrowTouchable, { left: SPACING.groupGap }]}
          onPress={() => scrollBy(-1)}
          accessibilityRole="button"
          accessibilityLabel="Προηγούμενα φίλτρα"
        >
          <View style={localStyles.arrowCircle}>
            <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
      )}

      {canScrollRight && (
        <TouchableOpacity
          style={[localStyles.arrowTouchable, { right: SPACING.groupGap }]}
          onPress={() => scrollBy(1)}
          accessibilityRole="button"
          accessibilityLabel="Περισσότερα φίλτρα"
        >
          <View style={localStyles.arrowCircle}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  scroll: { flex: 1 },
  // Όλο το ύψος της λωρίδας είναι στόχος αφής, ώστε να μη χρειάζεται ακρίβεια στο πάτημα.
  arrowTouchable: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  // Λευκός κύκλος με σκούρο βελάκι, και όχι γεμάτος όπως τα φίλτρα: με το χρώμα των φίλτρων
  // έμοιαζε κι αυτός φίλτρο. Η σκιά δείχνει ότι επιπλέει πάνω από τη λωρίδα.
  arrowCircle: {
    width: TOUCH.minTargetSize,
    height: TOUCH.minTargetSize,
    borderRadius: TOUCH.minTargetSize / 2,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.text,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
