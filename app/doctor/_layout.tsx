import { Stack } from 'expo-router';
import { DoctorMenuProvider } from '../../components/DoctorMenu';

export default function DoctorLayout() {
  return (
    <DoctorMenuProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="folder/[amka]" options={{ presentation: 'modal' }} />
      </Stack>
    </DoctorMenuProvider>
  );
}
