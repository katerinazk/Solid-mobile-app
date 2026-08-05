import { Redirect } from 'expo-router';
import { ROUTES } from '../constants/routes';

// Το "/" (ρίζα της εφαρμογής) δεν έχει δικό του περιεχόμενο -
// ανακατευθύνει στην πραγματική οθόνη επιλογής ρόλου.
export default function Index() {
  return <Redirect href={ROUTES.LOGIN} />;
}
