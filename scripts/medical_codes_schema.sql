-- ============================================================================
--  Πίνακας ιατρικών κωδικών (πρότυπα ιστορικού)
--  Τρέξε το ΟΛΟΚΛΗΡΟ αρχείο μία φορά στο Supabase -> SQL Editor,
--  και μετά κάνε import το scripts/out/medical_codes.csv στον πίνακα.
-- ============================================================================

-- Αναζήτηση χωρίς τόνους: "διαβητης" πρέπει να βρίσκει "Σακχαρώδης διαβήτης".
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Η unaccent() είναι STABLE (εξαρτάται από λεξικό), οπότε δεν επιτρέπεται σε generated
-- column. Τη "σφραγίζουμε" σε immutable wrapper δηλώνοντας ρητά το λεξικό.
create or replace function immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

-- Με cascade, ώστε να μπορεί το αρχείο να ξανατρέξει: η search_medical_codes() επιστρέφει
-- setof medical_codes, δηλαδή εξαρτάται από τον τύπο του πίνακα και μπλοκάρει το σκέτο drop.
-- Την ξαναφτιάχνουμε παρακάτω, οπότε δεν χάνεται τίποτα.
drop table if exists medical_codes cascade;

create table medical_codes (
  id          bigserial primary key,

  -- Ποιο διεθνές πρότυπο: ICD10 (διαγνώσεις), ATC (φάρμακα/εμβόλια), LOINC (εξετάσεις)
  system      text not null check (system in ('ICD10', 'ATC', 'LOINC')),
  code        text not null,
  name        text not null,

  -- Σε ποια οθόνη της εφαρμογής εμφανίζεται. Ο ίδιος κωδικός ICD μπορεί να υπάρχει σε
  -- περισσότερες από μία (π.χ. διάγνωση και λόγος νοσηλείας) - γι' αυτό μία γραμμή ανά
  -- κατηγορία, ώστε τα ερωτήματα της εφαρμογής να μένουν ένα απλό "where category = ...".
  category    text not null check (category in (
                'Διαγνώσεις', 'Αλλεργίες', 'Νοσηλίες', 'Φάρμακα', 'Εμβολιασμοί', 'Εξετάσεις'
              )),

  -- Ο κωδικός-γονέας στην ιεραρχία (A00.0 -> A00, J07AE01 -> J07AE). Χρήσιμο αν αργότερα
  -- θελήσεις πλοήγηση ανά κεφάλαιο αντί για σκέτη αναζήτηση.
  parent_code text,

  -- Η ονομασία του γονέα. Τα υποεπίπεδα του ICD γράφονται συντομογραφικά και δεν στέκουν
  -- μόνα τους: το C41.1 λέει "Κάτω γνάθος", αλλά σημαίνει "κακοήθες νεόπλασμα κάτω γνάθου".
  -- Η εφαρμογή το δείχνει σε δεύτερη γραμμή, σε παρένθεση.
  parent_name text,

  -- Οι οδοί χορήγησης του φαρμάκου, στα ελληνικά, χωρισμένες με κόμμα ("Από το στόμα,
  -- Παρεντερικά"). Κενό όπου ο ΠΟΥ δεν ορίζει ημερήσια δόση - τότε η φόρμα του γιατρού
  -- προσφέρει όλη τη λίστα οδών.
  routes      text,

  -- Ό,τι επιπλέον κουβαλάει το κάθε πρότυπο: DDD/οδός χορήγησης για ATC, class/shortname
  -- για LOINC. Σε jsonb ώστε να μη γεμίσει ο πίνακας στήλες που αφορούν ένα μόνο πρότυπο.
  extra       jsonb,

  -- Εναλλακτικοί όροι του προτύπου ("Σάκχαρο" για τη γλυκόζη). Μπαίνουν στην αναζήτηση
  -- αλλά δεν εμφανίζονται πουθενά.
  synonyms    text,

  -- Πεδίο αναζήτησης: πεζά, χωρίς τόνους, ονομασία μαζί με τα συνώνυμα. Υπολογίζεται μόνο του.
  name_search text generated always as (immutable_unaccent(lower(name || ' ' || coalesce(synonyms, '')))) stored,

  unique (system, code, category)
);

create index medical_codes_category_idx    on medical_codes (category);
create index medical_codes_code_idx        on medical_codes (category, code text_pattern_ops);
create index medical_codes_name_search_idx on medical_codes using gin (name_search extensions.gin_trgm_ops);

-- ============================================================================
--  Αναζήτηση για το autocomplete της εφαρμογής
--  Παράδειγμα: select * from search_medical_codes('Διαγνώσεις', 'διαβητ');
-- ============================================================================
create or replace function search_medical_codes(
  p_category text,
  p_query    text,
  p_limit    int default 20
)
returns setof medical_codes
language sql
stable
as $$
  select *
  from medical_codes
  where category = p_category
    and (
      name_search like '%' || immutable_unaccent(lower(p_query)) || '%'
      or code ilike p_query || '%'
    )
  -- Πρώτα όσα ταιριάζουν στον κωδικό, μετά όσα ταιριάζουν στην ίδια την ονομασία (και όχι
  -- μόνο σε κάποιο συνώνυμο), και τέλος τα συντομότερα ονόματα.
  order by
    (code ilike p_query || '%') desc,
    (immutable_unaccent(lower(name)) like '%' || immutable_unaccent(lower(p_query)) || '%') desc,
    length(name),
    name
  limit p_limit;
$$;

-- ============================================================================
--  Δικαιώματα: ο κατάλογος κωδικών είναι δημόσιος (δεν περιέχει δεδομένα ασθενών),
--  αλλά μόνο για ανάγνωση.
-- ============================================================================
alter table medical_codes enable row level security;

create policy "Ο κατάλογος κωδικών διαβάζεται από όλους"
  on medical_codes for select
  using (true);
