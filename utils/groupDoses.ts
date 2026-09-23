// Ομαδοποιεί εγγραφές εμβολιασμού με κοινό κωδικό (ίδιο εμβόλιο) σε μία "ομάδα δόσεων": η πιο
// πρόσφατη δόση είναι το πρόσωπο της κάρτας, οι υπόλοιπες κρύβονται μέχρι να ανοίξει η κάρτα.
//
// Οι εγγραφές χωρίς κωδικό (παλιές, ελεύθερου κειμένου) δεν ομαδοποιούνται - δεν υπάρχει
// αξιόπιστος τρόπος να ξέρουμε αν πρόκειται για το ίδιο εμβόλιο, οπότε μένουν μόνες τους.

export interface DoseGroup<T> {
  // Κωδικός εμβολίου, ή το url της εγγραφής όταν δεν υπάρχει κωδικός (μονή "ομάδα" του ενός).
  key: string;
  latest: T;
  // Παλαιότερες δόσεις του ίδιου εμβολίου, νεότερη προς παλαιότερη.
  previousDoses: T[];
  // Ίδιο με το latest.retraction - ώστε η ομάδα να μπορεί να περάσει κατευθείαν στο
  // groupByYearRetractedLast, που το περιμένει σε επίπεδο αντικειμένου.
  retraction?: any;
}

export function groupDoses<T extends { url: string; code?: string; administeredDate: string; retraction?: any }>(
  items: T[],
): DoseGroup<T>[] {
  // Δουλεύουμε πάντα σε σειρά νεότερα-πρώτα, ανεξάρτητα από το πώς θα ταξινομηθούν μετά οι
  // ομάδες - έτσι η πρώτη εγγραφή κάθε κωδικού που συναντάμε είναι πάντα η πιο πρόσφατη δόση.
  const newestFirst = [...items].sort(
    (a, b) => new Date(b.administeredDate).getTime() - new Date(a.administeredDate).getTime()
  );

  const groups: DoseGroup<T>[] = [];
  const indexByCode = new Map<string, number>();

  for (const item of newestFirst) {
    if (item.code) {
      const existingIndex = indexByCode.get(item.code);
      if (existingIndex !== undefined) {
        groups[existingIndex].previousDoses.push(item);
        continue;
      }
      indexByCode.set(item.code, groups.length);
    }
    groups.push({ key: item.code ?? item.url, latest: item, previousDoses: [], retraction: item.retraction });
  }

  return groups;
}
