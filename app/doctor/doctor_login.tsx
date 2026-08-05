import React, { useState } from 'react';
import { Text, View, TouchableOpacity, SafeAreaView, TextInput, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../../constants/colors';
import { loginStyles as styles } from '../../constants/loginStyles';
import { useAuth } from '../../hooks/useAuth';

export default function DoctorLoginScreen() {
  const { login, loading } = useAuth();
  const [doctorAmka, setDoctorAmka] = useState('');

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="dark-content" />
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={styles.loginCard}>
        <Ionicons name="medical" size={60} color={COLORS.primary} style={{ alignSelf: 'center', marginBottom: 20 }} />
        <Text style={styles.loginTitle}>Πρόσβαση Ιατρού</Text>
        <Text style={styles.loginSubtitle}>Συνδεθείτε μέσω του Solid Pod σας</Text>

        <Text style={styles.inputLabel}>ΑΜΚΑ</Text>
        <TextInput
          style={styles.loginInput}
          placeholder="11 ψηφία"
          keyboardType="numeric"
          value={doctorAmka}
          onChangeText={setDoctorAmka}
        />

        <Text style={styles.inputLabel}>Solid Provider (π.χ. inrupt.com)</Text>
        <TextInput style={styles.loginInput} value="https://datapod.igrant.io" editable={false} />

        <TouchableOpacity
          style={styles.solidLoginButton}
          onPress={() => {
            if (!doctorAmka) {
              alert("Παρακαλώ εισάγετε το ΑΜΚΑ σας.");
              return;
            }
            login('doctor', doctorAmka);
          }}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Text style={styles.solidLoginButtonText}>Σύνδεση στο Solid</Text>
              <Feather name="external-link" size={20} color={COLORS.white} style={{ marginLeft: 10 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
