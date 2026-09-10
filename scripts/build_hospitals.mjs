// ============================================================================
//  Φτιάχνει τον κατάλογο νοσοκομείων και ιδιωτικών κλινικών της Ελλάδας από τη Βικιπαίδεια.
//
//    node scripts/build_hospitals.mjs
//
//  Παράγει το scripts/out/hospitals.json, που ανεβαίνει μετά με το upload_table.mjs.
//  Οι ενότητες "Πρώην νοσοκομεία" αγνοούνται: δεν λειτουργούν πια, οπότε κανείς γιατρός δεν
//  καταχωρεί νοσηλία εκεί.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = 'Κατάλογος νοσοκομείων της Ελλάδας';
const API = `https://el.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=wikitext&format=json&formatversion=2`;

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

// Καθαρίζει τη σήμανση της Βικιπαίδειας από ένα κελί: συνδέσμους, παραπομπές, έντονη γραφή.
function cleanCell(raw) {
  let text = raw;

  // Παραπομπές <ref>...</ref> και <ref ... />
  text = text.replace(/<ref[^>]*\/>/g, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');

  // Σύνδεσμοι: [[Σελίδα|Εμφανιζόμενο]] -> Εμφανιζόμενο, [[Σελίδα]] -> Σελίδα
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Εξωτερικοί σύνδεσμοι [http://... κείμενο] -> κείμενο
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/\S+\]/g, '');

  // Υπόλοιπη σήμανση
  text = text.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<small>|<\/small>/gi, '');
  text = text.replace(/'''|''/g, '');
  text = text.replace(/\{\{[\s\S]*?\}\}/g, '');

  // Τα εισαγωγικά της Βικιπαίδειας είναι ανάμεικτα - τα ενοποιούμε σε ελληνικά.
  text = text.replace(/[«»"”“]/g, '"');

  return text.replace(/\s+/g, ' ').trim();
}

// Η ένδειξη "(ιδιωτικό)" είναι πλεονασμός: ο τύπος κρατιέται σε δική του στήλη.
function cleanName(raw) {
  return cleanCell(raw)
    .replace(/\s*\((ιδιωτικό|ιδιωτική)\)\s*$/i, '')
    .trim();
}

// Κρατάει μόνο το έτος ίδρυσης. Κάποιες γραμμές γράφουν διάστημα ("1888-2003") ή έχουν
// σχόλια δίπλα - παίρνουμε το πρώτο τετραψήφιο.
function parseFounded(raw) {
  const match = cleanCell(raw).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

function parseWikitext(wikitext) {
  const lines = wikitext.split('\n');

  const rows = [];
  // Η ενότητα δεύτερου επιπέδου είναι η περιφέρεια (Αττική, Κρήτη, ...). Η υποενότητα λέει
  // αν πρόκειται για ιδιωτικές κλινικές ή για πρώην νοσοκομεία.
  let region = '';
  let isPrivate = false;
  let skipSection = false;

  let inTable = false;
  let cells = [];

  const flushRow = () => {
    if (cells.length >= 2) {
      const name = cleanName(cells[0]);
      const area = cleanCell(cells[1]);
      if (name) {
        rows.push({
          name,
          area: area || region,
          region,
          type: isPrivate ? 'private' : 'public',
          founded: cells[2] !== undefined ? parseFounded(cells[2]) : null,
        });
      }
    }
    cells = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(={2,4})\s*(.+?)\s*\1\s*$/);
    if (heading) {
      flushRow();
      inTable = false;

      const level = heading[1].length;
      const title = heading[2];

      if (level === 2) {
        region = title;
        isPrivate = false;
        // Η "== Νοσοκομεία ==" είναι εισαγωγικό κείμενο χωρίς πίνακα, δεν πειράζει.
      }

      // "Πρώην νοσοκομεία" σε οποιοδήποτε επίπεδο -> εκτός καταλόγου.
      skipSection = /πρώην/i.test(title);
      if (level > 2) isPrivate = /ιδιωτικ/i.test(title);
      continue;
    }

    if (skipSection) continue;

    if (line.startsWith('{|')) {
      inTable = true;
      cells = [];
      continue;
    }
    if (!inTable) continue;

    if (line.startsWith('|}')) {
      flushRow();
      inTable = false;
      continue;
    }
    if (line.startsWith('|-')) {
      flushRow();
      continue;
    }
    // Επικεφαλίδες στηλών - δεν είναι δεδομένα.
    if (line.startsWith('!')) continue;

    if (line.startsWith('|')) {
      cells.push(line.slice(1));
    } else if (cells.length > 0) {
      // Συνέχεια κελιού σε επόμενη γραμμή (συμβαίνει σε γραμμές με παραπομπές).
      cells[cells.length - 1] += ' ' + line;
    }
  }

  flushRow();
  return rows;
}

async function main() {
  console.log('Λήψη από τη Βικιπαίδεια...');
  const response = await fetch(API);
  if (!response.ok) {
    console.error(`✖ Η λήψη απέτυχε: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const json = await response.json();
  const wikitext = json?.parse?.wikitext;
  if (!wikitext) {
    console.error('✖ Η σελίδα δεν επέστρεψε wikitext. Μήπως μετονομάστηκε;');
    process.exit(1);
  }

  const parsed = parseWikitext(wikitext);

  // Η σελίδα έχει δύο ενότητες "Πελοπόννησος" με κοινές εγγραφές. Κρατάμε μία ανά
  // ονομασία+περιοχή, αλλιώς ο γιατρός θα έβλεπε το ίδιο νοσοκομείο δύο φορές.
  const seen = new Set();
  const rows = [];
  for (const row of parsed) {
    const key = `${row.name}|${row.area}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'hospitals.json'), JSON.stringify(rows, null, 2), 'utf8');

  const publicCount = rows.filter((r) => r.type === 'public').length;
  console.log(`\n✔ ${rows.length} εγγραφές (${publicCount} δημόσια, ${rows.length - publicCount} ιδιωτικές).`);
  console.log(`   ${parsed.length - rows.length} διπλότυπα αφαιρέθηκαν.`);

  const byRegion = new Map();
  for (const row of rows) byRegion.set(row.region, (byRegion.get(row.region) || 0) + 1);
  console.log('\nΑνά περιφέρεια:');
  for (const [name, count] of [...byRegion].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(count).padStart(4)}  ${name}`);
  }
}

main();
