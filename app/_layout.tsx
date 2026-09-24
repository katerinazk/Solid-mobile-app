import 'react-native-get-random-values';
import 'text-encoding';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { AuthProvider } from '../contexts/AuthContext';
import { AppMessageHost } from '../components/AppMessage';

// Απαραίτητο για να κλείνει σωστά το popup του browser στο κινητό
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  // Εμποδίζει screenshot/screen recording σε όλη την εφαρμογή (Android: πλήρης αποκλεισμός,
  // iOS 13+: αποκλεισμός screenshot, iOS 11+: αποκλεισμός recording) - το περιεχόμενο είναι
  // ιατρικό δεδομένο σε κάθε οθόνη μετά τη σύνδεση, οπότε εφαρμόζεται καθολικά αντί ανά οθόνη.
  usePreventScreenCapture();

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/*
          Ο router πλοηγεί εδώ μόνος του μόλις φτάσει ο σύνδεσμος επιστροφής από τον browser (βλ.
          σχόλιο στο appRedirectUri, contexts/AuthContext.tsx) - και ξανά όταν φεύγουμε από δω για
          την εφαρμογή. Κι οι δύο μεταβάσεις δείχνουν το ίδιο ακριβώς περιεχόμενο (την οθόνη
          φόρτωσης), οπότε το animation του React Navigation είναι το μόνο που θα φαινόταν: σαν η
          οθόνη φόρτωσης να φεύγει και να ξαναμπαίνει. Χωρίς animation εδώ, η μετάβαση είναι
          αόρατη - ό,τι φαίνεται είναι μία συνεχόμενη οθόνη φόρτωσης.
        */}
        <Stack.Screen name="auth-redirect" options={{ animation: 'none' }} />
        {/* Παρουσιάζεται σαν καινούργια, ξεχωριστή οθόνη (γλιστράει από κάτω) αντί για το
            συνηθισμένο πέρασμα προς τα εμπρός στην ίδια ροή. Το "fullScreenModal" αντί για απλό
            "modal": το απλό modal αφήνει την προηγούμενη οθόνη να φαίνεται σμικρυμένη πίσω από
            την καινούργια - το fullScreenModal τη σκεπάζει εντελώς. */}
        <Stack.Screen name="patient/screens/patient_add_access" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {/* Ζει μία φορά, πάνω από κάθε οθόνη: εκεί εμφανίζονται όλα τα ενημερωτικά μηνύματα. */}
      <AppMessageHost />
    </AuthProvider>
  );
}
