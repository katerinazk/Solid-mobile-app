import { Stack } from 'expo-router';
import { PatientMenuProvider } from '../../components/patient/PatientMenu';

export default function PatientLayout() {
  return (
    <PatientMenuProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PatientMenuProvider>
  );
}
