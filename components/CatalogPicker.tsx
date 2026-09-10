import React, { useEffect, useRef, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';

interface Props<T> {
  // Το ερώτημα στη βάση. Το κρατάμε σε ref, οπότε μπορεί να γράφεται inline στη χρήση.
  search: (query: string) => Promise<{ data: T[]; error: any }>;
  value: T | null;
  onChange: (item: T | null) => void;
  keyOf: (item: T) => string;
  // Πώς φαίνεται μια εγγραφή στη λίστα αποτελεσμάτων και πώς όταν έχει επιλεγεί.
  renderRow: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  placeholder?: string;
  emptyText?: string;
  minQueryLength?: number;
  // Όταν δίνεται, ο χρήστης μπορεί να κρατήσει ό,τι έγραψε ακόμα κι αν δεν υπάρχει στον
  // κατάλογο. Μετατρέπει το κείμενο σε εγγραφή. Χωρίς αυτό, η επιλογή είναι κλειστή.
  onFreeText?: (text: string) => T;
  // Όταν δίνεται, το πεδίο παίρνει το στυλ της οθόνης αντί για τη μπάρα αναζήτησης με τον
  // μεγεθυντικό φακό: η φόρμα μοιάζει με πεδίο κειμένου, απλώς εμφανίζει προτάσεις καθώς
  // γράφει ο γιατρός.
  inputStyle?: StyleProp<TextStyle>;
  multiline?: boolean;
  // Ύψος της λίστας αποτελεσμάτων. Σε παράθυρο χρειάζεται να μείνει χαμηλή, σε ολόκληρη
  // οθόνη μπορεί να απλωθεί.
  resultsMaxHeight?: number;
}

// Επιλογή από κατάλογο αντί για ελεύθερο κείμενο: ο χρήστης γράφει, βλέπει προτάσεις και
// διαλέγει μία. Η ίδια συμπεριφορά χρειάζεται και για τα ιατρικά πρότυπα και για τα
// νοσοκομεία, οπότε ζει εδώ μία φορά - αλλάζει μόνο το ερώτημα και η εμφάνιση της γραμμής.
export function CatalogPicker<T>({
  search,
  value,
  onChange,
  keyOf,
  renderRow,
  renderSelected,
  placeholder = 'Τουλ. 2 χαρακτήρες...',
  emptyText = 'Δεν βρέθηκε αντίστοιχη καταχώρηση.',
  minQueryLength = 2,
  onFreeText,
  inputStyle,
  multiline,
  resultsMaxHeight,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);

  // Η search ξαναφτιάχνεται σε κάθε render της οθόνης που μας χρησιμοποιεί. Χωρίς το ref,
  // το useEffect θα ξανάτρεχε ατέρμονα.
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    // Μόλις επιλεγεί κάτι, δεν έχει νόημα να συνεχίζει να ψάχνει.
    if (value) return;

    const trimmed = query.trim();
    if (trimmed.length < minQueryLength) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Μικρή καθυστέρηση ώστε να μη στέλνουμε ένα ερώτημα σε κάθε χαρακτήρα.
    let canceled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await searchRef.current(trimmed);
        if (canceled) return;
        setResults(error ? [] : data);
      } finally {
        if (!canceled) setSearching(false);
      }
    }, 300);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [query, value, minQueryLength]);

  const trimmedQuery = query.trim();

  const handleSelect = (item: T) => {
    onChange(item);
    setQuery('');
    setResults([]);
  };

  if (value) {
    return (
      <View style={localStyles.selected}>
        <View style={{ flex: 1 }}>{renderSelected(value)}</View>
        <TouchableOpacity
          onPress={() => { onChange(null); setQuery(''); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close-circle" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {inputStyle ? (
        <TextInput
          style={inputStyle}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={COLORS.medium}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      ) : (
        <View style={localStyles.searchBox}>
          <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
          <TextInput
            style={localStyles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={COLORS.medium}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
      )}

      {trimmedQuery.length >= minQueryLength && (
        searching ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
        ) : (
          <>
            {results.length === 0 ? (
              <Text style={localStyles.emptyText}>{emptyText}</Text>
            ) : (
              <ScrollView
                style={[localStyles.resultList, !!resultsMaxHeight && { maxHeight: resultsMaxHeight }]}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {results.map((item) => (
                  <TouchableOpacity key={keyOf(item)} style={localStyles.resultRow} onPress={() => handleSelect(item)}>
                    {renderRow(item)}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Ο κατάλογος δεν είναι ποτέ πλήρης. Αν δεν βρίσκει αυτό που ψάχνει, ο χρήστης
                κρατάει ό,τι έγραψε αντί να κολλήσει. */}
            {!!onFreeText && (
              <TouchableOpacity
                style={localStyles.freeTextRow}
                onPress={() => handleSelect(onFreeText(trimmedQuery))}
              >
                <Ionicons name="create-outline" size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={localStyles.freeTextLabel} numberOfLines={2}>
                  Χρήση του κειμένου: "{trimmedQuery}"
                </Text>
              </TouchableOpacity>
            )}
          </>
        )
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    paddingHorizontal: 14,
    minHeight: TOUCH.minTargetSize,
  },
  searchInput: { flex: 1, fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },

  // Ύψος όσο ~4 αποτελέσματα: αρκετό για να διαλέξει, χωρίς να σπρώχνει το κουμπί εκτός οθόνης.
  resultList: {
    maxHeight: 200,
    marginTop: SPACING.groupGap,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 15,
    backgroundColor: COLORS.white,
  },
  resultRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.lightest },

  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightest,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 15,
    padding: 14,
    // Ίδιο κενό με το πεδίο κειμένου, ώστε να μη μετακινείται το επόμενο πεδίο της φόρμας
    // μόλις ο χρήστης διαλέξει κάτι.
    marginBottom: 30,
  },

  emptyText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, textAlign: 'center', marginTop: 12 },

  freeTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.groupGap,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 15,
    minHeight: TOUCH.minTargetSize,
  },
  freeTextLabel: { flex: 1, fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary },
});
