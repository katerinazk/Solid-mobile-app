// Οι τύποι εξέτασης, όπως τους χωρίζει η οθόνη των εξετάσεων.
export const EXAM_TYPES = [
  'Εργαστηριακές',
  'Απεικονιστικές',
  'Λειτουργικές',
  'Ενδοσκοπικές',
  'Ιστολογικές',
] as const;

// Οι τρόποι χορήγησης φαρμάκου. Η ορολογία είναι ίδια με αυτή που χρησιμοποιεί ο κατάλογος
// ATC στη στήλη routes, ώστε όταν ο ΠΟΥ ορίζει έναν μοναδικό τρόπο για μια ουσία να μπορεί
// να προεπιλεγεί αυτόματα.
export const ADMINISTRATION_ROUTES = [
  'Από το στόμα',
  'Παρεντερικά',
  'Υπογλώσσια',
  'Εισπνοή',
  'Ρινικά',
  'Οφθαλμικά',
  'Ωτικά',
  'Δερματικά',
  'Διαδερμικά',
  'Από το ορθό',
  'Κολπικά',
  'Άλλο',
] as const;

// Ο κατάλογος γράφει και πιο ειδικές μορφές ("Εισπνοή (σκόνη)", "Αεροζόλ από το στόμα"), που
// δεν έχουν δικό τους κουμπί στη φόρμα. Τις αντιστοιχίζουμε στη γενική τους κατηγορία, ώστε η
// αυτόματη προεπιλογή να δουλεύει και εκεί.
export function matchAdministrationRoute(catalogRoute: string): string | null {
  const route = catalogRoute.trim().toLowerCase();

  const exact = ADMINISTRATION_ROUTES.find((option) => option.toLowerCase() === route);
  if (exact) return exact;

  if (route.startsWith('εισπνοή') || route.includes('αεροζόλ')) return 'Εισπνοή';
  if (route.includes('εμφύτευμα')) return 'Παρεντερικά';
  if (route.includes('αλοιφή')) return 'Δερματικά';

  return null;
}

// Τα φίλτρα στις οθόνες εξετάσεων: οι ίδιοι τύποι, με το "Όλες" μπροστά.
export const EXAM_FILTERS = ['Όλες', ...EXAM_TYPES] as const;
