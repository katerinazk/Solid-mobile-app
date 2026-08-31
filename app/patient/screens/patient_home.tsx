import React from 'react';
import { Text, SafeAreaView, StatusBar } from 'react-native';
import { sharedStyles as styles } from '../../../constants/sharedStyles';
import { PatientHeader } from '../../../components/patient/PatientHeader';

export default function PatientHomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <PatientHeader />
      <Text style={[styles.emptyText, { marginTop: 50 }]}>Η λειτουργία έρχεται σύντομα.</Text>
    </SafeAreaView>
  );
}
