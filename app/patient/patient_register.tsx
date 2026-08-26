import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { TYPOGRAPHY } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';
import { registerPatient } from '../../services/patients';

export default function PatientRegisterScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [patientForm, setPatientForm] = useState({
    first_name: '',
    last_name: '',
    amka: '',
    birth_date: '',
    sex: '',
    blood_type: '',
    phone: '',
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

      // Πάμε στο Solid Login
      login('patient', patientForm.amka);
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={styles.loginCard}>
        <Ionicons name="person-add" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
        <Text style={styles.loginTitle}>Δημιουργία Λογαριασμού</Text>

        <Text style={styles.inputLabel}>Όνομα</Text>
        <TextInput style={styles.loginInput} placeholder="π.χ. Μαρία" value={patientForm.first_name} onChangeText={(t) => setPatientForm({ ...patientForm, first_name: t })} />

        <Text style={styles.inputLabel}>Επίθετο</Text>
        <TextInput style={styles.loginInput} placeholder="π.χ. Παππά" value={patientForm.last_name} onChangeText={(t) => setPatientForm({ ...patientForm, last_name: t })} />

        <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
        <TextInput style={styles.loginInput} placeholder="11 ψηφία" keyboardType="numeric" value={patientForm.amka} onChangeText={(t) => setPatientForm({ ...patientForm, amka: t })} />

        <Text style={styles.inputLabel}>Ημερομηνία Γέννησης</Text>
        <TextInput style={styles.loginInput} placeholder="π.χ. 1990-07-22" value={patientForm.birth_date} onChangeText={(t) => setPatientForm({ ...patientForm, birth_date: t })} />

        <Text style={styles.inputLabel}>Φύλο</Text>
        <TextInput style={styles.loginInput} placeholder="Άνδρας / Γυναίκα" value={patientForm.sex} onChangeText={(t) => setPatientForm({ ...patientForm, sex: t })} />

        <Text style={styles.inputLabel}>Ομάδα Αίματος</Text>
        <TextInput style={styles.loginInput} placeholder="π.χ. A+" value={patientForm.blood_type} onChangeText={(t) => setPatientForm({ ...patientForm, blood_type: t })} />

        <Text style={styles.inputLabel}>Τηλέφωνο</Text>
        <TextInput style={styles.loginInput} placeholder="π.χ. 6912345678" keyboardType="numeric" value={patientForm.phone} onChangeText={(t) => setPatientForm({ ...patientForm, phone: t })} />

        <TouchableOpacity style={styles.solidLoginButton} onPress={handlePatientRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Αποθήκευση & Σύνδεση</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => router.back()}>
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText }}>Έχω ήδη λογαριασμό</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
