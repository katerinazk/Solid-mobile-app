import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../constants/colors';

export default function RoleSelectionScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <FontAwesome5 name="heartbeat" size={70} color={COLORS.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.title}>Σύνδεση</Text>

        <View style={{ width: '100%', marginTop: 50 }}>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/patient/login')}>
            <Text style={styles.buttonText}>Ασθενής</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => router.push('/doctor/login')}>
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
  title: { fontSize: 32, color: COLORS.text, fontWeight: '500', marginBottom: 40 },
  button: { backgroundColor: COLORS.primary, width: '100%', paddingVertical: 15, borderRadius: 25, marginBottom: 20, alignItems: 'center' },
  buttonText: { color: COLORS.white, fontSize: 18, fontWeight: '600' },
});
