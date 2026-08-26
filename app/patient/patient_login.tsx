import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { ROUTES } from '../../constants/routes';
import { TYPOGRAPHY } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';

export default function PatientLoginScreen() {
  const { login, loading } = useAuth();
  const [patientAmka, setPatientAmka] = useState('');

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={styles.loginCard}>
        <Ionicons name="medical" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
        <Text style={styles.loginTitle}>Σύνδεση</Text>

        <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
        <TextInput
          style={styles.loginInput}
          placeholder="11 ψηφία"
          keyboardType="numeric"
          value={patientAmka}
          onChangeText={setPatientAmka}
        />

        <TouchableOpacity
          style={styles.solidLoginButton}
          onPress={() => {
            if (!patientAmka) {
              alert("Παρακαλώ εισάγετε το ΑΜΚΑ σας.");
              return;
            }
            login('patient', patientAmka);
          }}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Είσοδος</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 15, alignItems: 'center' }}
          onPress={() => router.push(ROUTES.PATIENT_REGISTER)}
        >
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.secondaryText }}>Δεν έχετε λογαριασμό;</Text>
          <Text style={{ color: COLORS.text, fontSize: TYPOGRAPHY.bodyText, fontWeight: 'bold' }}>Εγγραφή</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
