import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { TYPOGRAPHY, TOUCH } from '../constants/designSystem';

export default function RoleSelectionScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <FontAwesome5 name="heartbeat" size={70} color={COLORS.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.title}>MedPod</Text>

        <View style={{ width: '100%', marginTop: 50 }}>
          <Text style={styles.subtitle}>Σύνδεση ως ...</Text>

          <TouchableOpacity style={styles.button} onPress={() => router.push(ROUTES.PATIENT_LOGIN)}>
            <Text style={styles.buttonText}>Ασθενής</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => router.push(ROUTES.DOCTOR_LOGIN)}>
            <Text style={styles.buttonText}>Γιατρός</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.medium },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  title: { fontSize: TYPOGRAPHY.mainTitle, color: COLORS.text, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: TYPOGRAPHY.subtitle, color: COLORS.text, marginBottom: TOUCH.buttonGap },
  button: { backgroundColor: COLORS.primary, width: '100%', minHeight: TOUCH.buttonHeight, justifyContent: 'center', borderRadius: 25, marginBottom: TOUCH.buttonGap, alignItems: 'center' },
  buttonText: { color: COLORS.white, fontSize: 18, fontWeight: '600' },
});
