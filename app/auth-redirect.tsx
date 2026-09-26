import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { AuthLoadingScreen } from '../components/AuthLoadingScreen';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../hooks/useAuth';

// Πόση ώρα δίνουμε στην κανονική ροή να πλοηγήσει μόνη της πριν τη διορθώσουμε.
const SELF_HEAL_DELAY_MS = 400;

/**
 * Ο προορισμός στον οποίο επιστρέφει ο browser μετά τη σύνδεση στο Pod (βλ. appRedirectUri στο
 * AuthContext). Δεν κάνει τίποτα μόνη της - η πραγματική ανταλλαγή του κωδικού με token γίνεται
 * από ξεχωριστό listener του expo-auth-session, ανεξάρτητα από το routing.
 *
 * Χρειάζεται να υπάρχει ως πραγματική οθόνη γιατί ο expo-router προσπαθεί να πλοηγήσει εδώ μόλις
 * φτάσει ο σύνδεσμος επιστροφής (ταυτόχρονα με το SDK που τον διαβάζει για το token). Χωρίς αυτή
 * την οθόνη, θα πλοηγούσε στην αρχική οθόνη σύνδεσης για μια στιγμή. Μ' αυτήν, δείχνει την ίδια
 * οθόνη φόρτωσης, οπότε δεν φαίνεται καμία διαφορά.
 *
 * Αν η σύνδεση δεν ολοκληρωθεί (π.χ. ο χρήστης πάτησε "Ακύρωση" στην οθόνη συγκατάθεσης), η
 * πλοήγηση της ροής μπορεί να έγινε ΠΡΙΝ φτάσει εδώ ο σύνδεσμος επιστροφής, και η εφαρμογή θα
 * έμενε για πάντα σε αυτή την οθόνη. Γι' αυτό, όταν δεν τρέχει πια καμία σύνδεση, η οθόνη
 * στέλνει τον χρήστη πίσω μόνη της.
 */
export default function AuthRedirectScreen() {
  const { loading, isLoggedIn, isSwitchingPod, role } = useAuth();

  useEffect(() => {
    // Όσο τρέχει σύνδεση ή αλλαγή Pod, η κανονική ροή αναλαμβάνει την πλοήγηση.
    if (loading || isSwitchingPod) return;

    const timer = setTimeout(() => {
      if (isLoggedIn) {
        router.replace(role === 'doctor' ? ROUTES.DOCTOR_HOME : ROUTES.PATIENT_HOME);
      } else {
        router.replace(role === 'doctor' ? ROUTES.DOCTOR_LOGIN : role === 'patient' ? ROUTES.PATIENT_LOGIN : ROUTES.LOGIN);
      }
    }, SELF_HEAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, [loading, isLoggedIn, isSwitchingPod, role]);

  return <AuthLoadingScreen />;
}
