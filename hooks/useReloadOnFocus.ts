import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

// Οι φόρμες καταχώρησης ζουν σε ξεχωριστές οθόνες, οπότε η λίστα πρέπει να ξαναδιαβάσει τον
// φάκελο μόλις επιστρέψει σε αυτήν η εστίαση - αλλιώς η νέα ή επεξεργασμένη εγγραφή δεν θα
// φαινόταν. Η πρώτη εστίαση παραλείπεται: εκεί φορτώνει ήδη το useEffect του mount και θα
// ήταν διπλό αίτημα στο Pod.
export function useReloadOnFocus(reload: () => void) {
  const isFirstFocus = useRef(true);

  // Η reload ξαναφτιάχνεται σε κάθε render της οθόνης, οπότε την κρατάμε σε ref: αλλιώς το
  // useFocusEffect θα ξανάτρεχε συνεχώς.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      reloadRef.current();
    }, [])
  );
}
