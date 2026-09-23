import { ACCENTS } from './recordSearch';

// Το ίδιο πρόβλημα με το normalizeForSearch, αλλά για αναζήτηση που γίνεται ΣΤΗ ΒΑΣΗ
// (Supabase/PostgREST) αντί μέσα στην εφαρμογή: ένα απλό ilike συγκρίνει χαρακτήρα με
// χαρακτήρα, οπότε "παπαδοπουλου" (χωρίς τόνους) δεν ταιριάζει ποτέ με "Παπαδοπούλου" στη
// βάση - το normalizeForSearch δεν προλαβαίνει να βοηθήσει, γιατί η σύγκριση γίνεται πριν
// καν επιστρέψουν γραμμές από τον server.
//
// Λύση: αντί για ilike, χτίζουμε ένα case-insensitive regex (imatch) όπου κάθε φωνήεν
// αντικαθίσταται από κλάση χαρακτήρων με όλες τις τονισμένες/άτονες μορφές του - έτσι η ίδια
// αναζήτηση ταιριάζει είτε γραφτεί με τόνους είτε χωρίς, στη μία πλευρά ή στην άλλη.
const VOWEL_GROUPS: Record<string, string> = (() => {
  const groups: Record<string, Set<string>> = {};
  for (const [accented, base] of Object.entries(ACCENTS)) {
    (groups[base] ??= new Set([base])).add(accented);
  }
  const classes: Record<string, string> = {};
  for (const [base, variants] of Object.entries(groups)) {
    const group = `[${[...variants].join('')}]`;
    classes[base] = group;
    for (const variant of variants) classes[variant] = group;
  }
  return classes;
})();

// Χαρακτήρες με ειδική σημασία μέσα σε regex - χρειάζονται διαφυγή αν εμφανιστούν στην
// αναζήτηση, αλλιώς ένα "π.χ." θα έσπαγε το pattern αντί να ψάχνει την τελεία ως κείμενο.
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** Μετατρέπει ένα κείμενο αναζήτησης σε regex pattern ανεκτικό σε τόνους, για χρήση με imatch. */
export function toAccentInsensitivePattern(text: string): string {
  let pattern = '';
  for (const character of text.toLowerCase()) {
    pattern += VOWEL_GROUPS[character] ?? character.replace(REGEX_SPECIAL, '\\$&');
  }
  return pattern;
}
