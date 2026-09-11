import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { PatientHeader } from '../../../components/patient/PatientHeader';

export default function PatientSettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />
    </SafeAreaView>
  );
}
