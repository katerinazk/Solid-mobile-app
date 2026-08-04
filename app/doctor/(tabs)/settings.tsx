import React from 'react';
import { Text, SafeAreaView, StatusBar } from 'react-native';
import { sharedStyles } from '../../../constants/sharedStyles';
import { doctorStyles as styles } from '../../../constants/doctorStyles';
import { DoctorHeader } from '../../../components/DoctorHeader';

export default function DoctorSettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <DoctorHeader />
      <Text style={[sharedStyles.emptyText, { marginTop: 50 }]}>Η λειτουργία έρχεται σύντομα.</Text>
    </SafeAreaView>
  );
}
