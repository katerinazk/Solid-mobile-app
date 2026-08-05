import { Redirect } from 'expo-router';

// Το "/" (ρίζα της εφαρμογής) δεν έχει δικό του περιεχόμενο -
// ανακατευθύνει στην πραγματική οθόνη επιλογής ρόλου.
export default function Index() {
  return <Redirect href="/login" />;
}
