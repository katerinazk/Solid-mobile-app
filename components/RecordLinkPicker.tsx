import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { loginStyles } from '../constants/loginStyles';
import { TYPOGRAPHY, SPACING, TOUCH } from '../constants/designSystem';
import { HISTORY_CATEGORIES } from '../services/solidPod';
import {
  fetchCategoryRecords,
  HistoryRecordSummary,
  LinkedRecord,
  CATEGORY_SINGULAR,
} from '../services/historyRecords';
import { formatDate } from '../utils/age';

interface Props {
  webId: string;
  accessToken: string;
  // Η κατηγορία της ίδιας της φόρμας. Δεν προσφέρεται, γιατί δεν έχει νόημα να συνδεθεί μια
  // εξέταση με άλλη εξέταση μέσα από την ίδια οθόνη.
  excludeCategory: string;
  value: LinkedRecord | null;
  onChange: (link: LinkedRecord | null) => void;
}

/**
 * Συνδέει μια καταχώρηση με άλλη εγγραφή του ιστορικού - το "γιατί" πίσω από ένα φάρμακο ή
 * μια εξέταση. Ο γιατρός διαλέγει πρώτα κατηγορία και μετά τη συγκεκριμένη εγγραφή.
 *
 * Προσφέρονται οι εγγραφές ΟΛΩΝ των γιατρών: μια αγωγή δίνεται συχνά για διάγνωση που έθεσε
 * άλλος συνάδελφος. Η σύνδεση είναι προαιρετική.
 */
export function RecordLinkPicker({ webId, accessToken, excludeCategory, value, onChange }: Props) {
  const categories = useMemo(
    () => HISTORY_CATEGORIES.filter((category) => category !== excludeCategory),
    [excludeCategory]
  );

  const [isCategoryListOpen, setIsCategoryListOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [records, setRecords] = useState<HistoryRecordSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!category || !webId || !accessToken) return;

    let canceled = false;
    setLoading(true);
    setQuery('');

    fetchCategoryRecords(webId, category, accessToken)
      .then((data) => { if (!canceled) setRecords(data); })
      .catch(() => { if (!canceled) setRecords([]); })
      .finally(() => { if (!canceled) setLoading(false); });

    return () => { canceled = true; };
  }, [category, webId, accessToken]);

  // Η αναζήτηση γίνεται τοπικά: οι εγγραφές μιας κατηγορίας είναι ήδη στη μνήμη, δεν έχει
  // νόημα να ξαναρωτάμε το Pod σε κάθε χαρακτήρα.
  const visibleRecords = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return records;
    return records.filter(
      (record) =>
        record.title?.toLowerCase().includes(trimmed) ||
        record.code?.toLowerCase().includes(trimmed)
    );
  }, [records, query]);

  const handleSelect = (record: HistoryRecordSummary) => {
    onChange({
      category: record.category,
      url: record.url,
      title: record.title,
      code: record.code,
      parentName: record.parentName,
    });
    setCategory('');
    setQuery('');
    setRecords([]);
  };

  if (value) {
    return (
      <View>
        <Text style={loginStyles.inputLabel}>Σύνδεση με</Text>
        <View style={localStyles.selected}>
          <View style={{ flex: 1 }}>
            <Text style={localStyles.selectedCategory}>{CATEGORY_SINGULAR[value.category] || value.category}</Text>
            <Text style={localStyles.selectedTitle}>
              {!!value.code && <Text style={localStyles.code}>{value.code}  </Text>}
              {value.title}
            </Text>
            {!!value.parentName && <Text style={localStyles.parentName}>({value.parentName})</Text>}
          </View>
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={loginStyles.inputLabel}>Σύνδεση με</Text>

      <TouchableOpacity
        style={[loginStyles.loginInput, localStyles.field, { marginBottom: isCategoryListOpen || category ? 0 : 30 }]}
        onPress={() => setIsCategoryListOpen((prev) => !prev)}
      >
        <Text style={{ color: category ? COLORS.text : COLORS.medium, fontSize: TYPOGRAPHY.bodyText }}>
          {category || 'Επιλέξτε κατηγορία (προαιρετικό)'}
        </Text>
        <Ionicons name={isCategoryListOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
      </TouchableOpacity>

      {isCategoryListOpen && (
        <View style={localStyles.categoryList}>
          {categories.map((option, index) => (
            <TouchableOpacity
              key={option}
              style={[localStyles.categoryOption, index === categories.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { setCategory(option); setIsCategoryListOpen(false); }}
            >
              <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!category && (
        <View style={{ marginTop: SPACING.groupGap, marginBottom: 30 }}>
          <View style={localStyles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
            <TextInput
              style={localStyles.searchInput}
              placeholder="Αναζήτηση..."
              placeholderTextColor={COLORS.medium}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 12 }} />
          ) : visibleRecords.length === 0 ? (
            <Text style={localStyles.emptyText}>
              {records.length === 0
                ? `Δεν υπάρχουν καταχωρήσεις στην κατηγορία ${category}.`
                : 'Δεν βρέθηκε καταχώρηση με αυτά τα στοιχεία.'}
            </Text>
          ) : (
            <ScrollView style={localStyles.resultList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {visibleRecords.map((record) => (
                <TouchableOpacity key={record.url} style={localStyles.resultRow} onPress={() => handleSelect(record)}>
                  <Text style={localStyles.resultTitle}>
                    {!!record.code && <Text style={localStyles.code}>{record.code}  </Text>}
                    {record.title}
                  </Text>
                  {!!record.parentName && <Text style={localStyles.parentName}>({record.parentName})</Text>}
                  {!!record.date && <Text style={localStyles.resultDate}>{formatDate(record.date)}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  field: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  categoryList: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
    marginTop: SPACING.groupGap,
    overflow: 'hidden',
  },
  categoryOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightest,
  },

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

  resultList: {
    maxHeight: 260,
    marginTop: SPACING.groupGap,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 15,
    backgroundColor: COLORS.white,
  },
  resultRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.lightest },
  resultTitle: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text },
  resultDate: { fontSize: TYPOGRAPHY.label, color: COLORS.text, marginTop: 2 },

  code: { fontWeight: 'bold', color: COLORS.primary },
  parentName: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2 },
  emptyText: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text, textAlign: 'center', marginTop: 12 },

  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightest,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 15,
    padding: 14,
    marginBottom: 30,
  },
  selectedCategory: { fontSize: TYPOGRAPHY.label, fontWeight: 'bold', color: COLORS.primary },
  selectedTitle: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text, marginTop: 2 },
});
