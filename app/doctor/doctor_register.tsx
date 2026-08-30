import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { TYPOGRAPHY } from '../../constants/designSystem';
import { ROUTES } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { registerDoctor } from '../../services/doctors';

export default function DoctorRegisterScreen() {
  const { login } = useAuth();
  const { amka: amkaParam, solidProvider, fromLoginAttempt } = useLocalSearchParams<{ amka?: string; solidProvider?: string; fromLoginAttempt?: string }>();
  const [loading, setLoading] = useState(false);
  const [doctorForm, setDoctorForm] = useState({
    first_name: '',
    last_name: '',
    amka: amkaParam || '',
    specialty: '',
    phone: '',
    email: '',
  });

  const handleDoctorRegister = async () => {
    if (!doctorForm.first_name || !doctorForm.last_name || !doctorForm.amka) {
      alert("Παρακαλώ συμπληρώστε τουλάχιστον Όνομα, Επίθετο και ΑΜΚΑ.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await registerDoctor(doctorForm);

      if (error) {
        alert("Σφάλμα αποθήκευσης: " + error.message);
        return;
      }

      if (fromLoginAttempt === 'true') {
        // Ο γιατρός είχε ήδη πληκτρολογήσει ΑΜΚΑ + Solid Provider και πάτησε Είσοδος -
        // πάμε κατευθείαν στη σύνδεση στο Pod, χωρίς να ξαναγυρίσουμε στη σελίδα σύνδεσης.
        login('doctor', doctorForm.amka, solidProvider);
      } else {
        router.replace(ROUTES.DOCTOR_LOGIN);
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
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. Δημήτρης" value={doctorForm.first_name} onChangeText={(t) => setDoctorForm({ ...doctorForm, first_name: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Επίθετο</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. Λάμπρου" value={doctorForm.last_name} onChangeText={(t) => setDoctorForm({ ...doctorForm, last_name: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>ΑΜΚΑ</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="11 ψηφία" keyboardType="numeric" value={doctorForm.amka} onChangeText={(t) => setDoctorForm({ ...doctorForm, amka: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Ειδικότητα</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. Παθολόγος" value={doctorForm.specialty} onChangeText={(t) => setDoctorForm({ ...doctorForm, specialty: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Τηλέφωνο</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. 6912345678" keyboardType="numeric" value={doctorForm.phone} onChangeText={(t) => setDoctorForm({ ...doctorForm, phone: t })} />

        <Text style={[styles.inputLabel, localStyles.label]}>Email</Text>
        <TextInput style={[styles.loginInput, localStyles.input]} placeholder="π.χ. giatros@email.com" keyboardType="email-address" autoCapitalize="none" value={doctorForm.email} onChangeText={(t) => setDoctorForm({ ...doctorForm, email: t })} />

        <TouchableOpacity style={styles.solidLoginButton} onPress={handleDoctorRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Αποθήκευση</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => router.back()}>
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>Έχω ήδη λογαριασμό</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  label: { color: COLORS.primary },
  input: { borderRadius: 25 },
});
