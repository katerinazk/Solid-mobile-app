// Ανάκληση και ιστορικό διορθώσεων μιας εγγραφής ιστορικού.
//
// Καμία εγγραφή δεν σβήνεται ποτέ από την εφαρμογή. Μια λανθασμένη καταχώρηση - λάθος
// ασθενής, διπλοκαταχώρηση - ΣΗΜΑΙΝΕΤΑΙ ως ανακληθείσα και μένει ορατή, ξεθωριασμένη.
//
// Ο λόγος δεν είναι γραφειοκρατικός: το πιο επικίνδυνο πράγμα σε έναν ιατρικό φάκελο δεν
// είναι μια εγγραφή που λείπει, αλλά μια λάθος εγγραφή που στέκεται σαν σωστή. Μια αλλεργία
// που καταχωρήθηκε σε λάθος ασθενή μπορεί να του στερήσει το σωστό φάρμακο για μια ζωή.
// Χρειάζεται λοιπόν τρόπος ανάκλησης - αλλά με σήμανση, ώστε να φαίνεται και τι γράφτηκε και
// ότι αποσύρθηκε, από ποιον και γιατί.
//
// Το πρότυπο HL7 FHIR έχει ακριβώς αυτή την έννοια ως κατάσταση "entered-in-error", σε
// Condition, AllergyIntolerance, Immunization και MedicationStatement.

/** Ποιος και πότε: κοινό και για την ανάκληση και για κάθε διόρθωση. */
export interface RecordStamp {
  /** Ημερομηνία σε μορφή YYYY-MM-DD. */
  at: string;
  /** ΑΜΚΑ του προσώπου που έκανε την ενέργεια. */
  by: string;
  /** Το όνομα όπως εμφανίζεται στην κάρτα: "Δρ. Παπαδόπουλος..." ή "κα Παπαδοπούλου". */
  byName: string;
}

export interface Retraction extends RecordStamp {
  reason: string;
}

/**
 * Η σήμανση που ξεχωρίζει μια πραγματική διόρθωση από οτιδήποτε άλλο βρεθεί στο ιστορικό.
 * Τη γράφει μόνο η επεξεργασία.
 */
const REVISION_EDIT = 'edit';

/** Μια προηγούμενη μορφή της εγγραφής, όπως ήταν πριν από μια διόρθωση. */
export interface RecordRevision extends RecordStamp {
  kind?: string;
  record: any;
}

export function isRetracted(record: any): boolean {
  return !!record?.retracted?.at;
}

export function parseRetraction(record: any): Retraction | undefined {
  const retracted = record?.retracted;
  if (!retracted?.at) return undefined;
  return {
    at: String(retracted.at),
    by: String(retracted.by || ''),
    byName: String(retracted.byName || ''),
    reason: String(retracted.reason || ''),
  };
}

/**
 * Χωρίζει μια λίστα εγγραφών σε ενεργές και ανακληθείσες, χωρίς να αλλάξει τη σειρά μέσα σε
 * κάθε ομάδα. Οι ανακληθείσες δεν είναι πια ενεργό ιστορικό - παραμένουν ορατές, αλλά σαν
 * υποσημείωση παρά σαν πρώτη γραμμή.
 */
export function partitionRetracted<T extends { retraction?: any }>(items: T[]): { active: T[]; retracted: T[] } {
  const active: T[] = [];
  const retracted: T[] = [];
  for (const item of items) {
    (item.retraction ? retracted : active).push(item);
  }
  return { active, retracted };
}

/**
 * Η ίδια λίστα, με τις ανακληθείσες εγγραφές μετακινημένες στο τέλος. Χρησιμοποιείται εκεί
 * όπου η λίστα είναι επίπεδη (χωρίς ομαδοποίηση ανά έτος) - π.χ. οι εκκρεμείς εξετάσεις, η
 * ενεργή αγωγή. Όπου υπάρχει ομαδοποίηση ανά έτος, δες groupByYearRetractedLast.
 */
export function withRetractedLast<T extends { retraction?: any }>(items: T[]): T[] {
  const { active, retracted } = partitionRetracted(items);
  return [...active, ...retracted];
}

/**
 * Το ιστορικό αλλαγών, όπως αξίζει να διαβαστεί.
 *
 * Εμφανίζονται μόνο οι εκδόσεις που γράφτηκαν από πραγματική επεξεργασία - όσες φέρουν τη
 * σήμανση "edit". Για ένα διάστημα το ανέβασμα αποτελέσματος και το "Έναρξη" περνούσαν
 * κι αυτά λανθασμένα από εδώ, και άφησαν πίσω τους εγγραφές "Τροποποιήθηκε" που δείχνουν ως
 * προηγούμενη μορφή ακριβώς το ίδιο πράγμα. Δεν τις σβήνουμε από το Pod - η εφαρμογή δεν
 * σβήνει τίποτα - αλλά δεν τις δείχνουμε: δεν περιγράφουν καμία αλλαγή.
 */
export function parseRevisions(record: any): RecordRevision[] {
  const stored: RecordRevision[] = Array.isArray(record?.revisions) ? record.revisions : [];
  return stored.filter((revision) => revision?.kind === REVISION_EDIT);
}

/**
 * Η εγγραφή όπως θα γραφτεί μετά από διόρθωση: τα νέα στοιχεία, με την προηγούμενη μορφή
 * φυλαγμένη στο ιστορικό.
 *
 * Χωρίς αυτό η επεξεργασία θα ήταν εξίσου καταστροφική με τη διαγραφή - γράφει πάνω στο ίδιο
 * αρχείο, οπότε το προηγούμενο περιεχόμενο θα χανόταν χωρίς ίχνος.
 *
 * Το ίδιο το ιστορικό ΔΕΝ μπαίνει μέσα στο ιστορικό: κρατάμε κάθε έκδοση μία φορά, αλλιώς το
 * αρχείο θα διπλασιαζόταν σε κάθε διόρθωση.
 */
/** Σύγκριση χωρίς να μετράει η σειρά των πεδίων μέσα στο αντικείμενο. */
function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function withRevision(existing: any, next: any, stamp: RecordStamp): any {
  const { revisions, retracted, retractionLog, ...previous } = existing || {};

  // Η φόρμα επεξεργασίας μπορεί να αποθηκευτεί χωρίς καμία πραγματική αλλαγή στα δεδομένα -
  // π.χ. ανοίγει κάποιος τη φόρμα και πατάει απευθείας "Αποθήκευση". Χωρίς αυτόν τον έλεγχο θα
  // καταγραφόταν "Τροποποιήθηκε" με ακριβώς την ίδια προηγούμενη μορφή, που δεν περιγράφει
  // καμία αλλαγή και απλώς μπερδεύει όποιον το διαβάσει στο Ιστορικό Αλλαγών.
  if (stableStringify(previous) === stableStringify(next)) {
    return existing;
  }

  return {
    // Η ανάκληση επιβιώνει της διόρθωσης. Οι ροές που ξαναγράφουν ολόκληρη την εγγραφή - το
    // "Έναρξη" σε φάρμακο, το ανέβασμα αποτελέσματος σε εξέταση - χτίζουν το αντικείμενο από
    // την αρχή, οπότε χωρίς αυτό θα ξε-ανακαλούσαν σιωπηλά μια αποσυρμένη εγγραφή.
    ...(retracted ? { retracted } : {}),
    // Το αρχείο των ανακλήσεων που έχουν αναιρεθεί επιβιώνει κι αυτό της διόρθωσης.
    ...(Array.isArray(retractionLog) ? { retractionLog } : {}),
    ...next,
    revisions: [...(Array.isArray(revisions) ? revisions : []), { ...stamp, kind: REVISION_EDIT, record: previous }],
  };
}

/**
 * Η εγγραφή όπως θα γραφτεί όταν κάποιος τη ΣΥΜΠΛΗΡΩΝΕΙ αντί να τη διορθώνει: ο ασθενής
 * ανεβάζει το αποτέλεσμα μιας εξέτασης, ή πατάει "Έναρξη" σε μια αγωγή.
 *
 * Δεν μπαίνει τίποτα στο ιστορικό αλλαγών, γιατί δεν έγινε τροποποίηση: κανείς δεν άλλαξε
 * κάτι που είχε γράψει κάποιος άλλος. Μια εγγραφή "Τροποποιήθηκε" εκεί θα ήταν και λάθος και
 * θόρυβος - θα έδειχνε ως προηγούμενη μορφή ακριβώς την ίδια εξέταση.
 *
 * Κρατάμε όμως όσα δεν ξέρουν αυτές οι ροές: την ανάκληση και τις παλιές τροποποιήσεις. Και οι
 * δύο ξαναχτίζουν την εγγραφή από το μηδέν, οπότε χωρίς αυτό θα τα έσβηναν αθόρυβα.
 */
export function withExistingHistory(existing: any, next: any): any {
  return {
    ...(existing?.retracted ? { retracted: existing.retracted } : {}),
    ...(Array.isArray(existing?.retractionLog) ? { retractionLog: existing.retractionLog } : {}),
    ...(Array.isArray(existing?.revisions) ? { revisions: existing.revisions } : {}),
    ...next,
  };
}

/**
 * Η εγγραφή όπως θα γραφτεί όταν αναιρείται η ανάκλησή της: η εγγραφή ξαναγίνεται ενεργή.
 *
 * Ούτε αυτό σβήνει κάτι. Η ανάκληση που αναιρέθηκε μεταφέρεται στο "retractionLog", μαζί με το
 * ποιος και πότε την αναίρεσε, ώστε να μένει ίχνος ότι η εγγραφή είχε αποσυρθεί κάποτε.
 */
export function withoutRetraction(existing: any, stamp: RecordStamp): any {
  const { retracted, retractionLog, ...rest } = existing || {};
  if (!retracted) return existing;
  return {
    ...rest,
    retractionLog: [
      ...(Array.isArray(retractionLog) ? retractionLog : []),
      { ...retracted, restoredAt: stamp.at, restoredBy: stamp.by, restoredByName: stamp.byName },
    ],
  };
}

/** Η εγγραφή σημασμένη ως ανακληθείσα. Το περιεχόμενό της μένει ακριβώς όπως ήταν. */
export function withRetraction(existing: any, stamp: RecordStamp, reason: string): any {
  return {
    ...existing,
    retracted: { ...stamp, reason: reason.trim() },
  };
}
