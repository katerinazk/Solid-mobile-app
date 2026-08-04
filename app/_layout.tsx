import 'react-native-get-random-values';
import 'text-encoding';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AuthProvider } from '../contexts/AuthContext';

// Απαραίτητο για να κλείνει σωστά το popup του browser στο κινητό
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
