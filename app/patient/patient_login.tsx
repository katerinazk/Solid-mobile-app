import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { ROUTES } from '../../constants/routes';
import { TYPOGRAPHY, TOUCH } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { fetchPatientByAmka } from '../../services/patients';
import { showMessage } from '../../utils/appMessage';
import { isValidAmka } from '../../utils/validateAmka';
import { SelectField } from '../../components/SelectField';
import { AuthLoadingScreen } from '../../components/AuthLoadingScreen';
import {
  SOLID_PROVIDER_OPTIONS,
  DEFAULT_SOLID_PROVIDER_URL,
  solidProviderLabelFromUrl,
  solidProviderUrlFromLabel,
} from '../../constants/solidProviders';

export default function PatientLoginScreen() {
  const { login, loading } = useAuth();
  const [patientAmka, setPatientAmka] = useState('');
  const [solidProvider, setSolidProvider] = useState(DEFAULT_SOLID_PROVIDER_URL);
  const [checking, setChecking] = useState(false);

  // Από τη στιγμή που ανοίγει ο browser για τη σύνδεση στο Pod μέχρι να μάθουμε αν πέτυχε,
  // η οθόνη δεν δείχνει ξανά τη φόρμα - θα έδειχνε "έτοιμη για είσοδο" ενώ στο παρασκήνιο
  // τρέχει ακόμα ο έλεγχος. Το "loading" μένει αναμμένο σε όλο αυτό το διάστημα.
  if (loading) {
    return <AuthLoadingScreen />;
  }

  const handleLogin = async () => {
    if (!patientAmka.trim() || !solidProvider.trim()) {
      showMessage("Παρακαλώ συμπληρώστε ΑΜΚΑ και Solid Provider.");
      return;
    }
    if (!isValidAmka(patientAmka)) {
      showMessage("Μη έγκυρο ΑΜΚΑ.");
      return;
    }

    try {
      setChecking(true);
      const { data, error } = await fetchPatientByAmka(patientAmka.trim());

      if (error || !data) {
        // Δεν υπάρχει ασθενής με αυτό το ΑΜΚΑ - πάμε πρώτα στη δημιουργία λογαριασμού
        router.push({
          pathname: ROUTES.PATIENT_REGISTER,
          params: { amka: patientAmka.trim(), solidProvider: solidProvider.trim(), fromLoginAttempt: 'true' },
        });
        return;
      }

      login('patient', patientAmka.trim(), solidProvider.trim());
    } catch (error) {
      showMessage("Απρόσμενο σφάλμα.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.loginContainer, { backgroundColor: COLORS.medium }]}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

      {/* Η κάρτα κυλάει: με ανοιχτή τη λίστα των παρόχων ψηλώνει, και σε μικρή οθόνη το
          κουμπί της εισόδου θα έβγαινε εκτός. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.loginCard}>
        <FontAwesome5 name="heartbeat" size={70} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
        <Text style={[styles.loginTitle, { color: COLORS.text }]}>MedPod</Text>
        <Text style={[styles.loginSubtitle, { color: COLORS.text }]}>Σύνδεση</Text>

        <Text style={[styles.inputLabel, { color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle }]}>ΑΜΚΑ</Text>
        <TextInput
          style={[styles.loginInput, localStyles.input]}
          placeholder="11 ψηφία"
          keyboardType="numeric"
          value={patientAmka}
          onChangeText={setPatientAmka}
        />

        {/* Κλειστή λίστα αντί για πληκτρολογημένη διεύθυνση. Ένα URL γραμμένο λάθος κατά
            ένα γράμμα έβγαζε "αποτυχία επικοινωνίας με τον Provider", που δεν λέει σε
            κανέναν τι να διορθώσει - και κανείς δεν ξέρει απέξω τη διεύθυνση του Pod του. */}
        <SelectField
          label="Solid Provider"
          labelStyle={[styles.inputLabel, { color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle }]}
          inputStyle={localStyles.input}
          value={solidProviderLabelFromUrl(solidProvider)}
          onChange={(label) => setSolidProvider(solidProviderUrlFromLabel(label))}
          options={SOLID_PROVIDER_OPTIONS}
        />

        <TouchableOpacity
          style={styles.solidLoginButton}
          onPress={handleLogin}
          disabled={checking}
        >
          {checking ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Είσοδος</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 15, alignItems: 'center', minHeight: TOUCH.minTargetSize, justifyContent: 'center' }}
          onPress={() => router.push(ROUTES.PATIENT_REGISTER)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.secondaryText }}>Δεν έχετε λογαριασμό;</Text>
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText, fontWeight: 'bold' }}>Εγγραφή</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: { borderRadius: 25 },
});
