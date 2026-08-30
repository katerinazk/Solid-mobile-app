import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { TYPOGRAPHY, TOUCH } from '../../constants/designSystem';
import { ROUTES } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { fetchDoctorByAmka } from '../../services/doctors';

export default function DoctorLoginScreen() {
  const { login, loading } = useAuth();
  const [doctorAmka, setDoctorAmka] = useState('');
  const [solidProvider, setSolidProvider] = useState('https://datapod.igrant.io');
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    if (!doctorAmka.trim() || !solidProvider.trim()) {
      alert("Παρακαλώ συμπληρώστε ΑΜΚΑ και Solid Provider.");
      return;
    }

    try {
      setChecking(true);
      const { data, error } = await fetchDoctorByAmka(doctorAmka.trim());

      if (error || !data) {
        // Δεν υπάρχει γιατρός με αυτό το ΑΜΚΑ - πάμε πρώτα στη δημιουργία λογαριασμού
        router.push({
          pathname: ROUTES.DOCTOR_REGISTER,
          params: { amka: doctorAmka.trim(), solidProvider: solidProvider.trim(), fromLoginAttempt: 'true' },
        });
        return;
      }

      login('doctor', doctorAmka.trim(), solidProvider.trim());
    } catch (error) {
      alert("Απρόσμενο σφάλμα.");
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

      <View style={styles.loginCard}>
        <FontAwesome5 name="heartbeat" size={70} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
        <Text style={[styles.loginTitle, { color: COLORS.text }]}>MedPod</Text>
        <Text style={[styles.loginSubtitle, { color: COLORS.text }]}>Σύνδεση</Text>

        <Text style={[styles.inputLabel, { color: COLORS.primary, fontSize: TYPOGRAPHY.subtitle }]}>ΑΜΚΑ</Text>
        <TextInput
          style={[styles.loginInput, localStyles.input]}
          placeholder="11 ψηφία"
          keyboardType="numeric"
          value={doctorAmka}
          onChangeText={setDoctorAmka}
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
          onPress={handleLogin}
          disabled={loading || checking}
        >
          {(loading || checking) ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.solidLoginButtonText}>Είσοδος</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 15, alignItems: 'center', minHeight: TOUCH.minTargetSize, justifyContent: 'center' }}
          onPress={() => router.push(ROUTES.DOCTOR_REGISTER)}
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
