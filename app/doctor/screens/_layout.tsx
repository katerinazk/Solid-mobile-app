import { Tabs } from 'expo-router';
import { COLORS } from '../../../constants/colors';

export default function DoctorTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: COLORS.medium,
        tabBarStyle: { backgroundColor: COLORS.primary, borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarIcon: () => null,
        tabBarIconStyle: { width: 0, height: 0, margin: 0 },
      }}
    >
      <Tabs.Screen name="doctor_home" options={{ title: 'Αρχική' }} />
      <Tabs.Screen name="doctor_access" options={{ title: 'Προσβάσεις' }} />
      <Tabs.Screen name="doctor_settings" options={{ title: 'Ρυθμίσεις' }} />
    </Tabs>
  );
}
