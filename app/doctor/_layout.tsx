import { Stack } from 'expo-router';
import { DoctorMenuProvider } from '../../components/DoctorMenu';

export default function DoctorLayout() {
  return (
    <DoctorMenuProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="patient_screens/doctor_diagnoseis" options={{ presentation: 'modal' }} />
      </Stack>
    </DoctorMenuProvider>
  );
}
