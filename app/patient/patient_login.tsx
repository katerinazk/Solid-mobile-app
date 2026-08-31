import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { ROUTES } from '../../constants/routes';
import { TYPOGRAPHY, TOUCH } from '../../constants/designSystem';
import { useAuth } from '../../hooks/useAuth';

export default function PatientLoginScreen() {
  const { login, loading } = useAuth();
  const [patientAmka, setPatientAmka] = useState('');
  const [solidProvider, setSolidProvider] = useState('https://datapod.igrant.io');

  return (
    <SafeAreaView style={[styles.loginContainer, { backgroundColor: COLORS.medium }]}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

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

        <Text style={[styles.inputLabel, { color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle }]}>Solid Provider</Text>
        <TextInput
          style={[styles.loginInput, localStyles.input]}
          placeholder="π.χ. https://datapod.igrant.io"
          autoCapitalize="none"
          autoCorrect={false}
          value={solidProvider}
          onChangeText={setSolidProvider}
        />

        <TouchableOpacity
          style={styles.solidLoginButton}
          onPress={() => {
            if (!patientAmka.trim() || !solidProvider.trim()) {
              alert("Παρακαλώ συμπληρώστε ΑΜΚΑ και Solid Provider.");
              return;
            }
            login('patient', patientAmka.trim(), solidProvider.trim());
          }}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.solidLoginButtonText}>Είσοδος</Text>}
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
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  input: { borderRadius: 25 },
});
