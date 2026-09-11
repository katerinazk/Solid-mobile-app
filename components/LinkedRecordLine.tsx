import React from 'react';
import { Text } from 'react-native';
import { COLORS } from '../constants/colors';
import { doctorStyles } from '../constants/doctorStyles';
import { LinkedRecord, CATEGORY_SINGULAR } from '../services/historyRecords';

// Η γραμμή "Σύνδεση με" στις κάρτες φαρμάκων και εξετάσεων: δείχνει σε ποια άλλη εγγραφή του
// ιστορικού οφείλεται η καταχώρηση, ώστε να μη μένει αναπάντητο το "γιατί δόθηκε αυτό".
export function LinkedRecordLine({ link }: { link?: LinkedRecord | null }) {
  if (!link) return null;

  return (
    <Text style={doctorStyles.diagnosisCardDetail}>
      <Text style={doctorStyles.diagnosisCardLabel}>Σύνδεση με: </Text>
      {CATEGORY_SINGULAR[link.category] || link.category} · {!!link.code && <Text style={{ color: COLORS.primary }}>{link.code} </Text>}{link.title}
    </Text>
  );
}
