// Χωρίζει μια ταξινομημένη λίστα ιστορικού σε ομάδες ανά έτος.
//
// Σε ιστορικό που απλώνεται σε χρόνια, ο τίτλος της χρονιάς δίνει σημείο αναφοράς καθώς
// κατεβαίνει η λίστα - χωρίς αυτόν, δέκα κάρτες μοιάζουν ίδιες μεταξύ τους. Προτιμήθηκε το
// έτος και όχι ο μήνας: με λίγες εγγραφές ανά χρόνο, ο μήνας θα έφτιαχνε δεκάδες ομάδες του
// ενός, που είναι θόρυβος αντί για βοήθεια.

export interface YearSection<T> {
  title: string;
  data: T[];
}

/** Ο τίτλος για εγγραφές που δεν έχουν, ή δεν έχουν έγκυρη, ημερομηνία. */
export const UNKNOWN_YEAR = 'Χωρίς ημερομηνία';

/**
 * Η σειρά της λίστας ΔΕΝ αλλάζει: κάθε φορά που αλλάζει η χρονιά ανοίγει νέα ομάδα. Έτσι
 * δουλεύει σωστά και όταν ο χρήστης αντιστρέψει την ταξινόμηση, χωρίς δεύτερη λογική.
 */
export function groupByYear<T>(items: T[], getTime: (item: T) => number): YearSection<T>[] {
  const sections: YearSection<T>[] = [];
  let current: YearSection<T> | null = null;

  for (const item of items) {
    const time = getTime(item);
    const title = Number.isFinite(time) ? String(new Date(time).getFullYear()) : UNKNOWN_YEAR;

    if (!current || current.title !== title) {
      current = { title, data: [] };
      sections.push(current);
    }
    current.data.push(item);
  }

  return sections;
}
