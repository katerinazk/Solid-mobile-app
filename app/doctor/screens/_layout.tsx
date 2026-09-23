import { Tabs } from 'expo-router';
import { COLORS } from '../../../constants/colors';
import { TYPOGRAPHY } from '../../../constants/designSystem';

export default function DoctorTabsLayout() {
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
      <Tabs.Screen name="doctor_home" options={{ title: 'Αρχική' }} />
      <Tabs.Screen name="doctor_account" options={{ title: 'Λογαριασμός' }} />
      {/* Ανοίγει μόνο από το κουμπί "Αίτημα Πρόσβασης" - το href: null την κρύβει από τη
          μπάρα καρτελών χωρίς να την αφαιρεί ως route, ο router.push συνεχίζει να δουλεύει. */}
      <Tabs.Screen name="doctor_add_access" options={{ href: null }} />
    </Tabs>
  );
}
