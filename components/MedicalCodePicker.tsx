import React, { useEffect, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';
import { searchMedicalCodes, MedicalCode, MedicalCodeCategory } from '../services/medicalCodes';

interface Props {
  category: MedicalCodeCategory;
  value: MedicalCode | null;
  onChange: (code: MedicalCode | null) => void;
  placeholder?: string;
  // Όταν δίνεται, το πεδίο παίρνει το στυλ της οθόνης (π.χ. το textArea της φόρμας) αντί για
  // τη μπάρα αναζήτησης με τον μεγεθυντικό φακό: η φόρμα μοιάζει με πεδίο κειμένου, απλώς
  // εμφανίζει προτάσεις καθώς γράφει ο γιατρός.
  inputStyle?: StyleProp<TextStyle>;
  multiline?: boolean;
  // Ύψος της λίστας αποτελεσμάτων. Σε παράθυρο χρειάζεται να μείνει χαμηλή, σε ολόκληρη
  // οθόνη μπορεί να απλωθεί.
  resultsMaxHeight?: number;
}

// Κάτω από 2 χαρακτήρες τα αποτελέσματα είναι σχεδόν όλος ο κατάλογος και δεν λένε τίποτα.
const MIN_QUERY_LENGTH = 2;

// Επιλογή από τον κατάλογο προτύπων αντί για ελεύθερο κείμενο: ο γιατρός γράφει, βλέπει
// προτάσεις και διαλέγει μία, ώστε η καταχώρηση να έχει πάντα επίσημο κωδικό.
export function MedicalCodePicker({ category, value, onChange, placeholder = 'Τουλ. 2 χαρακτήρες...', inputStyle, multiline, resultsMaxHeight }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MedicalCode[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    // Μόλις επιλεγεί κάτι, δεν έχει νόημα να συνεχίζει να ψάχνει.
    if (value) return;

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Μικρή καθυστέρηση ώστε να μη στέλνουμε ένα ερώτημα σε κάθε χαρακτήρα.
    let canceled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await searchMedicalCodes(category, trimmed);
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
  }, [query, category, value]);

  const handleSelect = (item: MedicalCode) => {
    onChange(item);
    setQuery('');
    setResults([]);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  if (value) {
    return (
      <View style={localStyles.selected}>
        <View style={{ flex: 1 }}>
          <Text style={localStyles.selectedCode}>{value.code}</Text>
          <Text style={localStyles.selectedName}>{value.name}</Text>
          {!!value.parent_name && <Text style={localStyles.parentName}>({value.parent_name})</Text>}
        </View>
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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

      {query.trim().length >= MIN_QUERY_LENGTH && (
        searching ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
        ) : results.length === 0 ? (
          <Text style={localStyles.emptyText}>Δεν βρέθηκε αντίστοιχη καταχώρηση.</Text>
        ) : (
          <ScrollView style={[localStyles.resultList, !!resultsMaxHeight && { maxHeight: resultsMaxHeight }]} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {results.map((item) => (
              <TouchableOpacity key={item.id} style={localStyles.resultRow} onPress={() => handleSelect(item)}>
                <Text style={localStyles.resultCode}>{item.code}</Text>
                <Text style={localStyles.resultName}>{item.name}</Text>
                {!!item.parent_name && <Text style={localStyles.parentName}>({item.parent_name})</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  resultCode: { fontSize: TYPOGRAPHY.label, fontWeight: 'bold', color: COLORS.primary },
  resultName: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, marginTop: 2 },

  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightest,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 15,
    padding: 14,
    // Ίδιο κενό με το πεδίο κειμένου, ώστε να μη μετακινείται το επόμενο πεδίο της φόρμας
    // μόλις ο γιατρός διαλέξει κάτι.
    marginBottom: 30,
  },
  selectedCode: { fontSize: TYPOGRAPHY.label, fontWeight: 'bold', color: COLORS.primary },
  selectedName: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 2 },

  // Το συμφραζόμενο του γονέα: μικρότερο και ξεθωριασμένο, ώστε να μη διαβάζεται σαν
  // μέρος της ίδιας της ονομασίας.
  // Δευτερεύον κείμενο (14px) και όχι ετικέτα (12px): είναι περιεχόμενο που διαβάζει και
  // ο ασθενής, όχι επιγραφή πεδίου.
  parentName: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2 },
  emptyText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, textAlign: 'center', marginTop: 12 },
});
