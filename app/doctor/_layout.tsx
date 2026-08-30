import { Stack } from 'expo-router';
import { DoctorMenuProvider } from '../../components/doctor/DoctorMenu';

export default function DoctorLayout() {
  return (
    <DoctorMenuProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="doctor_profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_diagnoseis" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_vaccinations" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_allergies" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_hospitalizations" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_exams" options={{ presentation: 'modal' }} />
        <Stack.Screen name="patient_screens/doctor_medications" options={{ presentation: 'modal' }} />
      </Stack>
    </DoctorMenuProvider>
  );
}
