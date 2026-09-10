// ============================================================================
//  Διαβάζει τα 4 datasets ιατρικών κωδικών και παράγει ΕΝΑ csv έτοιμο για import
//  στον πίνακα medical_codes του Supabase.
//
//  Χρήση:
//    node scripts/build_medical_codes.mjs                     (πηγές: ~/Downloads)
//    node scripts/build_medical_codes.mjs C:/άλλος/φάκελος
//
//  Έξοδος: scripts/out/medical_codes.csv
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SRC = process.argv[2] || path.join(os.homedir(), 'Downloads');
const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'out');

const FILES = {
  atc: path.join(SRC, 'WHO ATC-DDD 2026-04-25.csv'),
  icdGreek: path.join(SRC, 'icd10.txt'),
  loincCore: path.join(SRC, 'Loinc_2.83', 'LoincTableCore', 'LoincTableCore.csv'),
  loincOrders: path.join(SRC, 'Loinc_2.83', 'AccessoryFiles', 'LoincUniversalLabOrdersValueSet', 'LoincUniversalLabOrdersValueSet.csv'),
};

// Κωδικοί ICD-10 που αφορούν αλλεργικές αντιδράσεις. Το πλήρες ICD δεν έχει νόημα στην
// οθόνη των αλλεργιών - ο γιατρός θα έψαχνε 14.000 διαγνώσεις για να βρει 60.
const ALLERGY_PREFIXES = [
  'T78',    // Παρενέργειες / αναφυλαξία / αγγειοοίδημα
  'T88.6',  // Αναφυλακτικό σοκ από φάρμακο
  'T88.7',  // Ανεπιθύμητη αντίδραση σε φάρμακο
  'Z88',    // Ιστορικό αλλεργίας σε φάρμακα
  'Z91.0',  // Ιστορικό αλλεργίας εκτός φαρμάκων
  'J30',    // Αλλεργική ρινίτιδα
  'L20',    // Ατοπική δερματίτιδα
  'L23',    // Αλλεργική δερματίτιδα εξ επαφής
  'L27',    // Δερματίτιδα από ουσίες που λήφθηκαν εσωτερικά
  'L50',    // Κνίδωση
  'K52.2',  // Αλλεργική γαστρεντερίτιδα
  'H10.1',  // Οξεία ατοπική επιπεφυκίτιδα
];

// Οι οδοί χορήγησης όπως τις κωδικοποιεί ο ΠΟΥ, στα ελληνικά. Ο γιατρός πρέπει να δει
// "Παρεντερικά", όχι "P".
const ROUTE_LABELS = {
  'O': 'Από το στόμα',
  'P': 'Παρεντερικά',
  'R': 'Από το ορθό',
  'N': 'Ρινικά',
  'V': 'Κολπικά',
  'SL': 'Υπογλώσσια',
  'TD': 'Διαδερμικά',
  'Inhal': 'Εισπνοή',
  'Inhal.solution': 'Εισπνοή (διάλυμα)',
  'Inhal.powder': 'Εισπνοή (σκόνη)',
  'Inhal.aerosol': 'Εισπνοή (αεροζόλ)',
  'oral aerosol': 'Αεροζόλ από το στόμα',
  'implant': 'Εμφύτευμα',
  's.c. implant': 'Υποδόριο εμφύτευμα',
  'intravesical': 'Ενδοκυστικά',
  'urethral': 'Ουρηθρικά',
  'Instill.solution': 'Ενστάλαξη',
  'ointment': 'Αλοιφή',
  'lamella': 'Οφθαλμικό έλασμα',
  'Chewing gum': 'Μασώμενη γόμα',
};

// ---------------------------------------------------------------- CSV helpers

// Μικρός RFC4180 parser: τα datasets έχουν κόμματα μέσα σε πεδία με εισαγωγικά
// (π.χ. "cholera, inactivated, whole cell"), οπότε το split(',') δεν αρκεί.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCsvObjects(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length >= header.length && r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function csvEscape(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Το "NA" στο αρχείο του ATC σημαίνει "δεν υπάρχει τιμή".
const clean = (v) => (v && v !== 'NA' ? v : null);

// ------------------------------------------------------------------ πηγές

// ICD-10 στα ελληνικά - tab separated, μία γραμμή ανά κωδικό: "A00.0<TAB>Χολέρα..."
function loadGreekIcd() {
  return fs.readFileSync(FILES.icdGreek, 'utf8')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 2 && parts[0].trim() && parts[1].trim())
    .map(([code, name]) => ({ code: code.trim(), name: name.trim() }));
}

// ATC - κρατάμε μόνο το 5ο επίπεδο (7 χαρακτήρες), που είναι η δραστική ουσία.
// Τα ανώτερα επίπεδα είναι κατηγορίες ("ANTIBACTERIALS FOR SYSTEMIC USE"), όχι φάρμακα.
//
// Το αρχείο έχει μία γραμμή ανά ΟΔΟ ΧΟΡΗΓΗΣΗΣ, όχι ανά ουσία: η cimetidine εμφανίζεται
// δύο φορές (O = από το στόμα, P = παρεντερικά) με διαφορετική ημερήσια δόση. Είναι ένα
// φάρμακο, οπότε ενοποιούμε ανά κωδικό και κρατάμε τις δόσεις σε λίστα μέσα στο extra.
function loadAtcSubstances() {
  const rows = readCsvObjects(FILES.atc);

  // Τα ανώτερα επίπεδα δεν μπαίνουν ως επιλογές, αλλά τα ονόματά τους δίνουν τα
  // συμφραζόμενα: J01CA04 "amoxicillin" ανήκει στα J01CA "Penicillins with extended spectrum".
  const namesByCode = new Map(rows.map((r) => [r.atc_code, r.atc_name]));

  const substances = new Map();

  for (const r of rows) {
    if (!r.atc_code || r.atc_code.length !== 7) continue;

    if (!substances.has(r.atc_code)) {
      substances.set(r.atc_code, {
        code: r.atc_code,
        name: r.atc_name,
        parent: r.atc_code.slice(0, 5),
        parentName: namesByCode.get(r.atc_code.slice(0, 5)) || null,
        routes: [],
        extra: { doses: [] },
      });
    }

    const route = clean(r.adm_r);
    const routeLabel = route ? (ROUTE_LABELS[route] || route) : null;
    if (routeLabel && !substances.get(r.atc_code).routes.includes(routeLabel)) {
      substances.get(r.atc_code).routes.push(routeLabel);
    }

    const dose = {
      ddd: clean(r.ddd),
      uom: clean(r.uom),
      adm_r: clean(r.adm_r),
      note: clean(r.note),
    };
    // Πολλές ουσίες δεν έχουν καθορισμένη DDD - τότε δεν υπάρχει τίποτα να κρατήσουμε.
    if (Object.values(dose).some((v) => v !== null)) {
      substances.get(r.atc_code).extra.doses.push(dose);
    }
  }

  return [...substances.values()].map((s) => ({
    ...s,
    routes: s.routes.join(', '),
    extra: s.extra.doses.length ? s.extra : null,
  }));
}

// LOINC - από τις 62.000 εργαστηριακές εξετάσεις κρατάμε τις ~1.500 του Universal Lab
// Orders Value Set: αυτές που πραγματικά παραγγέλνονται στην κλινική πράξη.
function loadLoincLabTests() {
  const core = new Map(readCsvObjects(FILES.loincCore).map((r) => [r.LOINC_NUM, r]));

  return readCsvObjects(FILES.loincOrders)
    .map((r) => ({ order: r, core: core.get(r.LOINC_NUM) }))
    .filter(({ core: c }) => c && c.STATUS === 'ACTIVE')
    .map(({ order, core: c }) => ({
      code: order.LOINC_NUM,
      name: order.LONG_COMMON_NAME || c.LONG_COMMON_NAME,
      extra: { class: c.CLASS || null, shortname: c.SHORTNAME || null, order_obs: order.ORDER_OBS || null },
    }));
}

// ------------------------------------------------------------------ σύνθεση

function build() {
  const rows = [];
  const add = (system, code, name, category, parentCode, extra, routes, parentName) =>
    rows.push({
      system, code, name, category,
      parent_code: parentCode || null,
      parent_name: parentName || null,
      routes: routes || null,
      extra: extra || null,
    });

  // --- ICD-10 (ελληνικά) -> Διαγνώσεις, Νοσηλίες και, το σχετικό υποσύνολο, Αλλεργίες
  const icd = loadGreekIcd();
  const isAllergy = (code) => ALLERGY_PREFIXES.some((p) => code === p || code.startsWith(p));

  // Τα υποεπίπεδα του ICD γράφονται συντομογραφικά και ΔΕΝ στέκουν μόνα τους: το C41.1 λέει
  // σκέτο "Κάτω γνάθος", ενώ σημαίνει "κακοήθες νεόπλασμα κάτω γνάθου". Κρατάμε το όνομα του
  // γονέα ώστε η εφαρμογή να το δείχνει από κάτω ως συμφραζόμενο.
  const icdNames = new Map(icd.map(({ code, name }) => [code, name]));

  for (const { code, name } of icd) {
    // A00.0 -> A00, A00 -> (καμία)
    const parent = code.includes('.') ? code.split('.')[0] : null;
    const parentName = parent ? icdNames.get(parent) || null : null;
    add('ICD10', code, name, 'Διαγνώσεις', parent, null, null, parentName);
    add('ICD10', code, name, 'Νοσηλίες', parent, null, null, parentName);
    if (isAllergy(code)) add('ICD10', code, name, 'Αλλεργίες', parent, null, null, parentName);
  }

  // --- ATC -> Φάρμακα, και το J07 (εμβόλια) ξεχωριστά στους Εμβολιασμούς.
  // Οι δραστικές ουσίες μπαίνουν και στις Αλλεργίες: η συνηθέστερη αλλεργία που
  // καταγράφει γιατρός είναι σε φάρμακο, και θέλει το όνομα της ουσίας, όχι κωδικό ICD.
  for (const { code, name, parent, parentName, extra, routes } of loadAtcSubstances()) {
    const isVaccine = code.startsWith('J07');
    add('ATC', code, name, isVaccine ? 'Εμβολιασμοί' : 'Φάρμακα', parent, extra, routes, parentName);
    // Στις αλλεργίες η οδός χορήγησης δεν έχει νόημα - αλλεργικός είσαι στην ουσία.
    if (!isVaccine) add('ATC', code, name, 'Αλλεργίες', parent, extra, null, parentName);
  }

  // --- LOINC -> Εργαστηριακές εξετάσεις
  for (const { code, name, extra } of loadLoincLabTests()) {
    add('LOINC', code, name, 'Εξετάσεις', null, extra, null, null);
  }

  return rows;
}

// -------------------------------------------------------------------- έξοδος

function main() {
  for (const [key, file] of Object.entries(FILES)) {
    if (!fs.existsSync(file)) {
      console.error(`✖ Δεν βρέθηκε το αρχείο (${key}):\n  ${file}`);
      console.error(`\nΔώσε τον σωστό φάκελο: node scripts/build_medical_codes.mjs "C:/διαδρομή/προς/τα/αρχεία"`);
      process.exit(1);
    }
  }

  const rows = build();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'medical_codes.csv');

  const header = 'system,code,name,category,parent_code,parent_name,routes,extra\n';
  const body = rows
    .map((r) => [
      r.system, r.code, r.name, r.category, r.parent_code, r.parent_name, r.routes,
      r.extra ? JSON.stringify(r.extra) : null,
    ].map(csvEscape).join(','))
    .join('\n');

  fs.writeFileSync(outFile, header + body + '\n', 'utf8');

  const perCategory = rows.reduce((acc, r) => ({ ...acc, [r.category]: (acc[r.category] || 0) + 1 }), {});
  console.log(`✔ ${rows.length} κωδικοί -> ${outFile}\n`);
  for (const [category, count] of Object.entries(perCategory)) {
    console.log(`   ${category.padEnd(14)} ${count}`);
  }
  console.log(`\nΕπόμενο βήμα: Supabase -> Table Editor -> medical_codes -> Import data from CSV`);
}

main();
