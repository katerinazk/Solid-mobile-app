import React from 'react';
import { AuthLoadingScreen } from '../components/AuthLoadingScreen';

/**
 * Ο προορισμός στον οποίο επιστρέφει ο browser μετά τη σύνδεση στο Pod (βλ. appRedirectUri στο
 * AuthContext). Δεν κάνει τίποτα μόνη της - η πραγματική ανταλλαγή του κωδικού με token γίνεται
 * από ξεχωριστό listener του expo-auth-session, ανεξάρτητα από το routing.
 *
 * Χρειάζεται να υπάρχει ως πραγματική οθόνη γιατί ο expo-router προσπαθεί να πλοηγήσει εδώ μόλις
 * φτάσει ο σύνδεσμος επιστροφής (ταυτόχρονα με το SDK που τον διαβάζει για το token). Χωρίς αυτή
 * την οθόνη, θα πλοηγούσε στην αρχική οθόνη σύνδεσης για μια στιγμή. Μ' αυτήν, δείχνει την ίδια
 * οθόνη φόρτωσης, οπότε δεν φαίνεται καμία διαφορά.
 */
export default function AuthRedirectScreen() {
  return <AuthLoadingScreen />;
}
