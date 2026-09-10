import React from 'react';
import { Text, View, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';
import { sharedStyles } from '../constants/sharedStyles';
import { doctorStyles } from '../constants/doctorStyles';
import { SPACING } from '../constants/designSystem';

interface Props {
  // "Νέα Διάγνωση" / "Επεξεργασία" κ.λπ.
  title: string;
  amka: string;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}

// Κοινό κέλυφος για όλες τις φόρμες καταχώρησης του γιατρού. Κάθε προσθήκη ανοίγει σε δική
// της οθόνη και όχι σε αναδυόμενο παράθυρο: η αναζήτηση στους καταλόγους προτύπων βγάζει
// δεκάδες αποτελέσματα και σε παράθυρο δεν χωρούσαν. Επειδή η φόρμα ζει εδώ, οι έξι οθόνες
// έχουν αναγκαστικά την ίδια εμφάνιση - κεφαλίδα, ΑΜΚΑ ασθενή, πεδία, κουμπί αποθήκευσης.
export function DoctorFormScreen({ title, amka, saving, onSave, children }: Props) {
  return (
    <SafeAreaView style={[doctorStyles.container, { backgroundColor: COLORS.light }]}>
      <StatusBar barStyle="dark-content" />

      <View style={doctorStyles.historyHeader}>
        <TouchableOpacity onPress={() => router.back()} style={doctorStyles.historyBackButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back-circle-outline" size={32} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={doctorStyles.historyTitle}>{title}</Text>
      </View>

      <Text style={doctorStyles.historyAmka}>ΑΜΚΑ: <Text style={doctorStyles.historyAmkaValue}>{amka}</Text></Text>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* keyboardShouldPersistTaps: αλλιώς το πρώτο πάτημα σε αποτέλεσμα της αναζήτησης
            απλώς έκλεινε το πληκτρολόγιο και χανόταν. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.sectionGap }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        <View style={{ paddingHorizontal: SPACING.sideMargin, paddingBottom: SPACING.bottomMargin, paddingTop: SPACING.groupGap }}>
          <TouchableOpacity
            style={[sharedStyles.addButton, { borderRadius: 25, marginBottom: 0 }]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={sharedStyles.addButtonText}>Αποθήκευση</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Το κοινό στυλ πεδίου, ώστε να μη διαφέρει η μία φόρμα από την άλλη.
export const formStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.medium,
    borderRadius: 20,
  },
});

// Ύψος λίστας αποτελεσμάτων κοινό σε όλες τις φόρμες: αρκετό για να διαλέξει ο γιατρός
// χωρίς να χρειάζεται να κυλήσει, χωρίς να καλύπτει τα υπόλοιπα πεδία.
export const PICKER_RESULTS_HEIGHT = 300;
