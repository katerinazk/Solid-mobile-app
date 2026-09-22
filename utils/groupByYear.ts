// Χωρίζει μια ταξινομημένη λίστα ιστορικού σε ομάδες ανά έτος.
//
// Σε ιστορικό που απλώνεται σε χρόνια, ο τίτλος της χρονιάς δίνει σημείο αναφοράς καθώς
// κατεβαίνει η λίστα - χωρίς αυτόν, δέκα κάρτες μοιάζουν ίδιες μεταξύ τους. Προτιμήθηκε το
// έτος και όχι ο μήνας: με λίγες εγγραφές ανά χρόνο, ο μήνας θα έφτιαχνε δεκάδες ομάδες του
// ενός, που είναι θόρυβος αντί για βοήθεια.

import { partitionRetracted } from './recordRevision';

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

/** Ο τίτλος της ενότητας που μαζεύει όλες τις ανακληθείσες εγγραφές, στο τέλος της λίστας. */
export const RETRACTED_SECTION_TITLE = 'Ανακλημένες Εγγραφές';

/**
 * Όπως το groupByYear, αλλά οι ανακληθείσες εγγραφές δεν μπαίνουν στη χρονιά τους - φεύγουν
 * σε δική τους ενότητα, πάντα τελευταία. Μια εγγραφή που σημαίνεται ως λανθασμένη δεν είναι
 * πια ενεργό ιστορικό, και ανάμεσα σε ενεργές εγγραφές ίδιας χρονιάς θα ξεγελούσε με μια
 * γρήγορη ματιά - ειδικά αφού μένει ορατή, μόνο ξεθωριασμένη.
 */
export function groupByYearRetractedLast<T extends { retraction?: any }>(
  items: T[],
  getTime: (item: T) => number
): YearSection<T>[] {
  const { active, retracted } = partitionRetracted(items);
  const sections = groupByYear(active, getTime);

  if (retracted.length > 0) {
    sections.push({ title: RETRACTED_SECTION_TITLE, data: retracted });
  }

  return sections;
}
