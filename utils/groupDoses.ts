// Ομαδοποιεί εγγραφές εμβολιασμού με κοινό κωδικό (ίδιο εμβόλιο) σε μία "ομάδα δόσεων": η πιο
// πρόσφατη δόση είναι το πρόσωπο της κάρτας, οι υπόλοιπες κρύβονται μέχρι να ανοίξει η κάρτα.
//
// Οι εγγραφές χωρίς κωδικό (παλιές, ελεύθερου κειμένου) δεν ομαδοποιούνται - δεν υπάρχει
// αξιόπιστος τρόπος να ξέρουμε αν πρόκειται για το ίδιο εμβόλιο, οπότε μένουν μόνες τους.
//
// Η ανάκληση μιας δόσης επηρεάζει την ομαδοποίηση μόνο όταν είναι η πιο πρόσφατη ("τελευταία")
// δόση του εμβολίου: τότε "σπάει" από την ομάδα και καταλήγει μόνη της στην ενότητα ανακλημένων
// εγγραφών, ενώ η ομάδα συνεχίζει κανονικά με "latest" την επόμενη ενεργή δόση από κάτω της -
// κι αν κι εκείνη είναι ανακληθείσα, φεύγει κι αυτή, κ.ο.κ. (σπάνια αλυσίδα διαδοχικών
// ανακλήσεων στην κορυφή). Μια ανάκληση σε ΠΑΛΑΙΟΤΕΡΗ δόση (όχι στην τελευταία) δεν σπάει
// τίποτα: η δόση συνεχίζει να φαίνεται κανονικά μέσα στην ομάδα (στις προηγούμενες δόσεις),
// αλλά εμφανίζεται ΚΑΙ ξεχωριστά, μόνη της, στις ανακλημένες εγγραφές.

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

  // Μαζεύουμε τις δόσεις κάθε κωδικού μαζί, με τη σειρά νεότερη προς παλαιότερη.
  const dosesByCode = new Map<string, T[]>();
  const groups: DoseGroup<T>[] = [];

  for (const item of newestFirst) {
    if (!item.code) {
      // Χωρίς κωδικό δεν ομαδοποιείται ποτέ - μόνη της ομάδα, ανακληθείσα ή όχι.
      groups.push({ key: item.url, latest: item, previousDoses: [], retraction: item.retraction });
      continue;
    }
    const list = dosesByCode.get(item.code);
    if (list) list.push(item); else dosesByCode.set(item.code, [item]);
  }

  for (const doses of dosesByCode.values()) {
    // Από την κορυφή (πιο πρόσφατη) προς τα κάτω: όσες συνεχόμενες δόσεις είναι ανακληθείσες
    // φεύγουν από την ομάδα, μία-μία, μέχρι να βρεθεί η πρώτη ενεργή (ή να αδειάσει η λίστα).
    let i = 0;
    while (i < doses.length && doses[i].retraction) {
      const leaving = doses[i];
      groups.push({ key: leaving.url, latest: leaving, previousDoses: [], retraction: leaving.retraction });
      i++;
    }

    const remaining = doses.slice(i);
    if (remaining.length === 0) continue;

    const [latest, ...previousDoses] = remaining;
    groups.push({ key: latest.code ?? latest.url, latest, previousDoses, retraction: undefined });

    // Μια παλαιότερη δόση που ανακλήθηκε δεν σπάει την ομάδα - συνεχίζει να φαίνεται κανονικά
    // μέσα στις προηγούμενες δόσεις, αλλά εμφανίζεται ΚΑΙ ξεχωριστά στις ανακλημένες εγγραφές.
    for (const dose of previousDoses) {
      if (dose.retraction) {
        groups.push({ key: `${dose.url}#retracted`, latest: dose, previousDoses: [], retraction: dose.retraction });
      }
    }
  }

  return groups;
}
