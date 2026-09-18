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

/** Μια προηγούμενη μορφή της εγγραφής, όπως ήταν πριν από μια διόρθωση. */
export interface RecordRevision extends RecordStamp {
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

export function parseRevisions(record: any): RecordRevision[] {
  return Array.isArray(record?.revisions) ? record.revisions : [];
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
export function withRevision(existing: any, next: any, stamp: RecordStamp): any {
  const { revisions, ...previous } = existing || {};
  return {
    // Η ανάκληση επιβιώνει της διόρθωσης. Οι ροές που ξαναγράφουν ολόκληρη την εγγραφή - το
    // "Έναρξη" σε φάρμακο, το ανέβασμα αποτελέσματος σε εξέταση - χτίζουν το αντικείμενο από
    // την αρχή, οπότε χωρίς αυτό θα ξε-ανακαλούσαν σιωπηλά μια αποσυρμένη εγγραφή.
    ...(previous.retracted ? { retracted: previous.retracted } : {}),
    ...next,
    revisions: [...(Array.isArray(revisions) ? revisions : []), { ...stamp, record: previous }],
  };
}

/** Η εγγραφή σημασμένη ως ανακληθείσα. Το περιεχόμενό της μένει ακριβώς όπως ήταν. */
export function withRetraction(existing: any, stamp: RecordStamp, reason: string): any {
  return {
    ...existing,
    retracted: { ...stamp, reason: reason.trim() },
  };
}
