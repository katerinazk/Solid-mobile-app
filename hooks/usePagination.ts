import { useEffect, useMemo, useState } from 'react';

// Πόσες καταχωρήσεις χωράει μια σελίδα ιστορικού.
export const PAGE_SIZE = 5;

/**
 * Κόβει μια λίστα σε σελίδες.
 *
 * Η τρέχουσα σελίδα περιορίζεται πάντα μέσα στα όρια: η λίστα μπορεί να κοντύνει ανά πάσα
 * στιγμή, είτε επειδή άλλαξε φίλτρο ο χρήστης είτε επειδή διαγράφηκε μια εγγραφή από το Pod,
 * και τότε η σελίδα στην οποία βρισκόταν μπορεί να μην υπάρχει πια.
 */
export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);

  // Ο περιορισμός γίνεται και στην κατάσταση, ώστε τα κουμπιά των σελίδων να δείχνουν σωστά.
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return { pageItems, page: safePage, pageCount, setPage };
}
