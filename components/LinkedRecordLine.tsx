import React from 'react';
import { Text, View } from 'react-native';
import { COLORS } from '../constants/colors';
import { doctorStyles } from '../constants/doctorStyles';
import { LinkedRecord, CATEGORY_SINGULAR } from '../services/historyRecords';

function LinkText({ link }: { link: LinkedRecord }) {
  return (
    <>
      {CATEGORY_SINGULAR[link.category] || link.category} · {!!link.code && <Text style={{ color: COLORS.primary }}>{link.code} </Text>}{link.title}
    </>
  );
}

// Οι συνδέσεις μιας κάρτας φαρμάκου ή εξέτασης: σε ποιες άλλες εγγραφές του ιστορικού
// οφείλεται η καταχώρηση, ώστε να μη μένει αναπάντητο το "γιατί δόθηκε αυτό".
export function LinkedRecordLines({ links }: { links?: LinkedRecord[] }) {
  if (!links || links.length === 0) return null;

  // Μία σύνδεση χωράει στην ίδια γραμμή με την ετικέτα, όπως κάθε άλλο πεδίο της κάρτας.
  if (links.length === 1) {
    return (
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Σύνδεση με: </Text>
        <LinkText link={links[0]} />
      </Text>
    );
  }

  // Περισσότερες πάνε σε δική τους λίστα από κάτω, με εσοχή.
  return (
    <View>
      <Text style={doctorStyles.diagnosisCardDetail}>
        <Text style={doctorStyles.diagnosisCardLabel}>Σύνδεση με:</Text>
      </Text>
      {links.map((link) => (
        <Text key={link.url} style={[doctorStyles.diagnosisCardDetail, { marginLeft: 12 }]}>
          • <LinkText link={link} />
        </Text>
      ))}
    </View>
  );
}
