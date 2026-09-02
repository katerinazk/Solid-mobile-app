import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { ROUTES } from '../../constants/routes';
import { TYPOGRAPHY, TOUCH } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { registerPatient } from '../../services/patients';

export default function PatientRegisterScreen() {
  const { login } = useAuth();
  const { amka: amkaParam, solidProvider, fromLoginAttempt } = useLocalSearchParams<{ amka?: string; solidProvider?: string; fromLoginAttempt?: string }>();
  const [loading, setLoading] = useState(false);
  const [patientForm, setPatientForm] = useState({
    first_name: '',
    last_name: '',
    amka: amkaParam || '',
    birth_date: '',
    sex: '',
    blood_type: '',
    phone: '',
    email: '',
  });

  const handlePatientRegister = async () => {
    if (!patientForm.first_name || !patientForm.last_name || !patientForm.amka) {
      alert("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα, Επίθετο και ΑΜΚΑ.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await registerPatient(patientForm);

      if (error) {
        alert("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      if (fromLoginAttempt === 'true') {
        // Ο ασθενής είχε ήδη πληκτρολογήσει ΑΜΚΑ + Solid Provider και πάτησε Είσοδος -
        // πάμε κατευθείαν στη σύνδεση στο Pod, χωρίς να ξαναγυρίσουμε στη σελίδα σύνδεσης.
        login('patient', patientForm.amka, solidProvider);
      } else {
        router.replace(ROUTES.PATIENT_LOGIN);
      }
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>Δημιουργία Λογαριασμού</Text>

        <Text style={[styles.inputLabel, localStyles.label]}>Όνομα</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. Μαρία" value={patientForm.first_name} onChangeText={(t) => setPatientForm({ ...patientForm, first_name: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Επίθετο</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. Παππά" value={patientForm.last_name} onChangeText={(t) => setPatientForm({ ...patientForm, last_name: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>ΑΜΚΑ</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="11 ψηφία" keyboardType="numeric" value={patientForm.amka} onChangeText={(t) => setPatientForm({ ...patientForm, amka: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Ημερομηνία Γέννησης</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. 1990-07-22" value={patientForm.birth_date} onChangeText={(t) => setPatientForm({ ...patientForm, birth_date: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Φύλο</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="Άνδρας / Γυναίκα" value={patientForm.sex} onChangeText={(t) => setPatientForm({ ...patientForm, sex: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Ομάδα Αίματος</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. A+" value={patientForm.blood_type} onChangeText={(t) => setPatientForm({ ...patientForm, blood_type: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Τηλέφωνο</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. 6912345678" keyboardType="numeric" value={patientForm.phone} onChangeText={(t) => setPatientForm({ ...patientForm, phone: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Email</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. name@email.com" keyboardType="email-address" autoCapitalize="none" value={patientForm.email} onChangeText={(t) => setPatientForm({ ...patientForm, email: t })} />

        <TouchableOpacity style={styles.solidLoginButton} onPress={handlePatientRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Αποθήκευση</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 15, alignItems: 'center', minHeight: TOUCH.minTargetSize, justifyContent: 'center' }}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>Έχω ήδη λογαριασμό</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  label: { color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle },
  input: { borderRadius: 25 },
});
