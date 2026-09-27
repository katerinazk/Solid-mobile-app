import { useCallback, useEffect, useMemo, useState } from 'react';

// Πόσες εγγραφές δείχνει η οθόνη πριν χρειαστεί σκρολ, και πόσες προστίθενται κάθε φορά -
// ίδιος αριθμός με τη σελίδα των ειδοποιήσεων, ώστε η εφαρμογή να "νιώθεται" ενιαία.
export const HISTORY_PAGE_SIZE = 10;

/**
 * Δείχνει σταδιακά μια ήδη υπολογισμένη (φιλτραρισμένη/ταξινομημένη) λίστα: οι πρώτες
 * HISTORY_PAGE_SIZE εγγραφές, και άλλες τόσες κάθε φορά που ο χρήστης φτάνει στο τέλος.
 *
 * Το ιστορικό στο Pod δεν έχει σελιδοποίηση από τον server - η εφαρμογή διαβάζει ήδη όλο τον
 * φάκελο μία φορά (η αναζήτηση και η ταξινόμηση το χρειάζονται). Αυτό το hook δεν αλλάζει τι
 * φορτώνεται από το Pod, μόνο πόσες εγγραφές αποδίδονται στην οθόνη τη φορά - το ίδιο όφελος
 * (μικρότερη, πιο γρήγορη λίστα στην πρώτη εμφάνιση) χωρίς δεύτερο ερώτημα στο δίκτυο.
 *
 * resetKey: όταν αλλάζει (αναζήτηση, φίλτρο, σειρά ταξινόμησης, αλλαγή καρτέλας), ξαναρχίζει
 * από τις πρώτες HISTORY_PAGE_SIZE - αλλιώς μια νέα αναζήτηση θα ξεκινούσε στη μέση μιας
 * παλιάς σελίδας.
 */
export function usePagedList<T>(items: T[], resetKey: unknown, pageSize = HISTORY_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  const loadMore = useCallback(() => {
    if (hasMore) setVisibleCount((count) => count + pageSize);
  }, [hasMore, pageSize]);

  return { visibleItems, hasMore, loadMore };
}
