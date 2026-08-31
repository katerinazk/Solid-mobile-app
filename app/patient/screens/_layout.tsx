import { Tabs } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { TYPOGRAPHY } from '../../../constants/designSystem';

export default function PatientTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.white,
        tabBarInactiveTintColor: COLORS.medium,
        tabBarStyle: { backgroundColor: COLORS.primary, borderTopWidth: 0 },
        tabBarLabelStyle: { fontSize: TYPOGRAPHY.secondaryText, fontWeight: '600' },
        tabBarIcon: () => null,
        tabBarIconStyle: { width: 0, height: 0, margin: 0 },
      }}
    >
      <Tabs.Screen name="patient_home" options={{ title: 'Αρχική' }} />
      <Tabs.Screen name="patient_access" options={{ title: 'Προσβάσεις' }} />
      <Tabs.Screen name="patient_settings" options={{ title: 'Ρυθμίσεις' }} />
    </Tabs>
  );
}
