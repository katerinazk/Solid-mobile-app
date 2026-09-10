// ============================================================================
//  Ανεβάζει έναν κατάλογο αναφοράς κατευθείαν σε πίνακα της βάσης, παρακάμπτοντας τον
//  importer του Supabase dashboard - που κόβεται σιωπηλά σε μεγάλα αρχεία.
//
//    node scripts/upload_table.mjs <πίνακας> <αρχείο.json>
//
//  Παραδείγματα:
//    node scripts/upload_table.mjs medical_codes scripts/out/medical_codes.json
//    node scripts/upload_table.mjs hospitals     scripts/out/hospitals.json
//
//  Χρειάζεται το service_role key (Supabase -> Project Settings -> API Keys). Δίνεται ως
//  μεταβλητή περιβάλλοντος και ΔΕΝ γράφεται πουθενά στο repo:
//
//    Windows PowerShell:
//      $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
//      node scripts/upload_table.mjs hospitals scripts/out/hospitals.json
//
//    Git Bash:
//      SUPABASE_SERVICE_ROLE_KEY="eyJ..." node scripts/upload_table.mjs hospitals scripts/out/hospitals.json
// ============================================================================

import fs from 'node:fs';

const SUPABASE_URL = 'https://xlmpzemrubhmevcnyluv.supabase.co';
const BATCH_SIZE = 1000;

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [table, dataFile] = process.argv.slice(2);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function request(method, url, body, extraHeaders) {
  const response = await fetch(url, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      // Χωρίς αυτό η βάση επιστρέφει πίσω όλες τις γραμμές που μόλις γράφτηκαν.
      Prefer: 'return=minimal',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${await response.text()}`);
  }

  return response;
}

// Μετράει τις γραμμές μέσω PostgREST, ώστε το script να επαληθεύει μόνο του το αποτέλεσμα
// αντί να χρειάζεται χειροκίνητο ερώτημα στον SQL Editor.
async function countRows() {
  const response = await request(
    'GET',
    `${SUPABASE_URL}/rest/v1/${table}?select=id`,
    undefined,
    { Prefer: 'count=exact', Range: '0-0' }
  );

  const range = response.headers.get('content-range') || '';
  return Number(range.split('/')[1] || 0);
}

// Όταν πέφτει μια παρτίδα χιλίων γραμμών, το μήνυμα της βάσης δεν λέει ποια φταίει.
// Δοκιμάζουμε τις πρώτες μία-μία, ώστε να φανεί αν φταίει συγκεκριμένη γραμμή ή ο πίνακας.
async function reportOffendingRow(batch, offset) {
  console.error('\nΔοκιμή μία-μία για να βρεθεί η γραμμή που φταίει...');

  for (let j = 0; j < Math.min(batch.length, 25); j++) {
    try {
      await request('POST', `${SUPABASE_URL}/rest/v1/${table}`, [batch[j]]);
    } catch (error) {
      console.error(`\nΓραμμή ${offset + j + 1}: ${JSON.stringify(batch[j])}`);
      console.error(error.message);
      return;
    }
  }

  console.error('\nΟι πρώτες 25 γραμμές πέρασαν μία-μία, άρα δεν φταίνε τα δεδομένα αλλά το');
  console.error('μέγεθος της παρτίδας. Μείωσε το BATCH_SIZE και ξανατρέξε.');
}

async function main() {
  if (!table || !dataFile) {
    fail('Χρήση: node scripts/upload_table.mjs <πίνακας> <αρχείο.json>');
  }
  if (!KEY) {
    fail(
      'Λείπει η μεταβλητή SUPABASE_SERVICE_ROLE_KEY.\n' +
        '  Στο PowerShell, στο ΙΔΙΟ παράθυρο τερματικού, πρώτα:\n' +
        '    $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."'
    );
  }
  if (!fs.existsSync(dataFile)) {
    fail(`Δεν βρέθηκε το ${dataFile}. Τρέξε πρώτα το αντίστοιχο build script.`);
  }

  const rows = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  console.log(`${rows.length} εγγραφές προς ανέβασμα στον πίνακα ${table}.`);

  // Ο κατάλογος ξαναγράφεται ολόκληρος κάθε φορά - είναι δεδομένα αναφοράς, όχι δεδομένα
  // χρηστών, οπότε δεν χάνεται τίποτα.
  console.log('Καθαρισμός πίνακα...');
  try {
    await request('DELETE', `${SUPABASE_URL}/rest/v1/${table}?id=gt.0`);
  } catch (error) {
    fail(
      'Ο καθαρισμός του πίνακα απέτυχε. Συνήθως φταίει λάθος κλειδί (θέλει service_role,\n' +
        `  όχι anon) ή ότι δεν έχει τρέξει το SQL που φτιάχνει τον πίνακα ${table}.\n\n  ` +
        error.message
    );
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      await request('POST', `${SUPABASE_URL}/rest/v1/${table}`, batch);
    } catch (error) {
      console.error(`\n✖ Απέτυχε στις γραμμές ${i + 1}-${i + batch.length}:`);
      console.error(error.message);
      await reportOffendingRow(batch, i);
      process.exit(1);
    }

    const done = Math.min(i + BATCH_SIZE, rows.length);
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }

  // Επαλήθευση από τη βάση την ίδια: αν ο μετρητής δεν συμφωνεί, κάτι κόπηκε στη διαδρομή.
  const stored = await countRows();
  console.log(`\nΣτη βάση υπάρχουν ${stored} γραμμές.`);

  if (stored !== rows.length) {
    fail(`Αναμενόταν ${rows.length}. Ξανατρέξε το script.`);
  }

  console.log('✔ Ολοκληρώθηκε.');
}

main();
