import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

// Κάθε πόσο ξαναδιαβάζεται ο φάκελος όσο η οθόνη είναι ανοιχτή. Το Solid Pod δεν ειδοποιεί
// από μόνο του για αλλαγές, οπότε ρωτάμε εμείς. Δεκαπέντε δευτερόλεπτα είναι το ίδιο διάστημα
// που χρησιμοποιεί και ο έλεγχος πρόσβασης του γιατρού.
const POLL_INTERVAL_MS = 15000;

/**
 * Κρατά μια λίστα ιστορικού ενημερωμένη με ό,τι αλλάζει στο Pod του ασθενή, από όποιον κι αν
 * γίνεται η αλλαγή - τον ίδιο τον ασθενή σε άλλη οθόνη, ή γιατρό που καταχωρεί ταυτόχρονα.
 *
 * Τρεις αφορμές ανανέωσης:
 *   - επιστροφή στην οθόνη (π.χ. από τη φόρμα καταχώρησης)
 *   - περιοδικός έλεγχος όσο η οθόνη είναι ανοιχτή
 *   - τράβηγμα της λίστας προς τα κάτω από τον χρήστη
 *
 * Η reload καλείται πάντα με silent = true, ώστε να μην αναβοσβήνει ο κύκλος φόρτωσης πάνω σε
 * περιεχόμενο που ήδη φαίνεται. Μόνο η πρώτη φόρτωση, από το useEffect της οθόνης, τον δείχνει.
 */
export function usePodAutoRefresh(reload: (silent?: boolean) => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);

  // Η reload ξαναφτιάχνεται σε κάθε render της οθόνης, οπότε την κρατάμε σε ref: αλλιώς το
  // useFocusEffect θα ξανάστηνε το χρονόμετρο συνεχώς.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // Η πρώτη εστίαση παραλείπεται: εκεί φορτώνει ήδη το useEffect του mount.
  const isFirstFocus = useRef(true);

  // Δύο ανανεώσεις ταυτόχρονα θα διπλασίαζαν τα αιτήματα στο Pod χωρίς λόγο - π.χ. αν ο
  // χρήστης τραβήξει τη λίστα τη στιγμή που χτυπάει το χρονόμετρο.
  const inFlight = useRef(false);

  const runReload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await reloadRef.current(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
      } else {
        runReload();
      }

      const timer = setInterval(runReload, POLL_INTERVAL_MS);
      // Το χρονόμετρο σταματά μόλις φύγει η εστίαση, ώστε να μη χτυπάει το Pod μια οθόνη
      // που κανείς δεν βλέπει.
      return () => clearInterval(timer);
    }, [runReload])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runReload();
    } finally {
      setRefreshing(false);
    }
  }, [runReload]);

  return { refreshing, onRefresh };
}
