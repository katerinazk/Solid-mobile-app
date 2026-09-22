import { useEffect, useMemo, useState } from 'react';

// Κάτω από αυτό το πλήθος εγγραφών η αναζήτηση δεν εμφανίζεται. Με λίγες εγγραφές η λίστα
// διαβάζεται με μια κύλιση, και το πεδίο θα έπαιρνε χώρο από την οθόνη χωρίς να προσφέρει.
export const SEARCH_MIN_RECORDS = 10;

// Οι τόνοι και το τελικό σίγμα πέφτουν πριν τη σύγκριση, ώστε "αλλεργια" να βρίσκει
// "Αλλεργία" και "ψωρασ" να βρίσκει "Ψώρας". Χωρίς αυτό ο χρήστης θα έπρεπε να τονίζει
// σωστά μέσα στο πεδίο αναζήτησης, που στο κινητό είναι κόπος χωρίς νόημα.
//
// Η αντιστοίχιση γράφεται ρητά αντί να χρησιμοποιηθεί το String.normalize: η κανονικοποίηση
// Unicode δεν είναι εγγυημένη σε όλες τις εκδόσεις της μηχανής Hermes.
const ACCENTS: Record<string, string> = {
  'ά': 'α', 'έ': 'ε', 'ή': 'η', 'ί': 'ι', 'ϊ': 'ι', 'ΐ': 'ι',
  'ό': 'ο', 'ύ': 'υ', 'ϋ': 'υ', 'ΰ': 'υ', 'ώ': 'ω', 'ς': 'σ',
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
};

/** Πεζά, χωρίς τόνους, χωρίς κενά στις άκρες: η μορφή στην οποία γίνεται η σύγκριση. */
export function normalizeForSearch(text: string): string {
  let result = '';
  for (const character of text.trim().toLowerCase()) {
    result += ACCENTS[character] ?? character;
  }
  return result;
}

/**
 * Αλφαβητική σειρά για ελληνικά ονόματα.
 *
 * Συγκρίνει πάνω στην ίδια μορφή με την αναζήτηση - χωρίς τόνους, πεζά - ώστε ο "Ἀλεξίου"
 * και ο "Αλεξιου" να μην καταλήγουν σε διαφορετικά σημεία της λίστας. Τα ελληνικά γράμματα
 * είναι διαδοχικά στο Unicode με αλφαβητική σειρά, οπότε η απλή σύγκριση αρκεί: δεν
 * στηριζόμαστε στο localeCompare, που χρειάζεται γλωσσικά δεδομένα και δεν είναι εγγυημένο
 * σε κάθε έκδοση της μηχανής Hermes.
 */
export function compareGreekNames(first: string, second: string): number {
  const a = normalizeForSearch(first);
  const b = normalizeForSearch(second);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Το πεδίο αναζήτησης μόνο: κείμενο και ορατότητα, χωρίς φιλτράρισμα.
 *
 * Το χρησιμοποιούν οι οθόνες που φιλτράρουν μόνες τους, επειδή η αναζήτησή τους πλέκεται με
 * άλλα φίλτρα - οι Εξετάσεις με τις κατηγορίες, τα Φάρμακα με τον χωρισμό σε ενεργά και
 * προηγούμενα. Έτσι το όριο εμφάνισης ορίζεται σε ένα σημείο για όλες τις οθόνες.
 *
 * Η ορατότητα κρίνεται από το ΣΥΝΟΛΟ των εγγραφών και όχι από τα αποτελέσματα, αλλιώς το
 * πεδίο θα εξαφανιζόταν κάτω από τα δάχτυλα του χρήστη μόλις η αναζήτηση άφηνε λίγες.
 */
export function useSearchField(totalRecords: number) {
  const [query, setQuery] = useState('');
  const searchVisible = totalRecords > SEARCH_MIN_RECORDS;

  // Όταν οι εγγραφές πέσουν κάτω από το όριο - π.χ. μετά από διαγραφή - το πεδίο κρύβεται.
  // Καθαρίζουμε και το κείμενό του, ώστε να μη μείνει ενεργό ένα φίλτρο που δεν φαίνεται.
  useEffect(() => {
    if (!searchVisible && query) setQuery('');
  }, [searchVisible, query]);

  /** Αληθές όταν ο χρήστης έχει γράψει κάτι: το χρησιμοποιεί το μήνυμα της άδειας λίστας. */
  const searching = normalizeForSearch(query).length > 0;

  return { query, setQuery, searchVisible, searching };
}

/**
 * Η αναζήτηση μιας οθόνης ιστορικού: το κείμενο, το αν φαίνεται το πεδίο, και οι εγγραφές
 * που ταιριάζουν.
 */
export function useRecordSearch<T>(items: T[], fields: (item: T) => (string | undefined)[]) {
  const { query, setQuery, searchVisible, searching } = useSearchField(items.length);

  const results = useMemo(() => {
    const needle = normalizeForSearch(query);
    if (!needle) return items;
    return items.filter((item) =>
      fields(item).some((field) => !!field && normalizeForSearch(field).includes(needle))
    );
    // Η fields είναι καθαρή συνάρτηση του item: δεν χρειάζεται να μπει στις εξαρτήσεις, και
    // δεν πρέπει, γιατί γράφεται επιτόπου στην οθόνη και αλλάζει ταυτότητα σε κάθε render.
  }, [items, query]);

  return { query, setQuery, searchVisible, searching, results };
}
