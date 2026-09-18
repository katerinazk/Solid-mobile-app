export function calculateAge(birthDate: string): number {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function formatDate(isoString?: string | null): string {
  const d = new Date(isoString || '');
  // Χωρίς αυτόν τον έλεγχο μια εγγραφή με κενή ή χαλασμένη ημερομηνία - π.χ. αρχείο που
  // πρόσθεσε κάποιος χειροκίνητα στο Pod - εμφάνιζε "NaN/NaN/NaN" μέσα στην κάρτα.
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
