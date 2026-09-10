-- ============================================================================
--  Πίνακας νοσοκομείων και ιδιωτικών κλινικών της Ελλάδας
--  Τρέξε το ΟΛΟΚΛΗΡΟ αρχείο μία φορά στο Supabase -> SQL Editor, και μετά:
--    node scripts/build_hospitals.mjs
--    node scripts/upload_table.mjs hospitals scripts/out/hospitals.json
-- ============================================================================

-- Αναζήτηση χωρίς τόνους: "ευαγγελισμος" πρέπει να βρίσκει "Ευαγγελισμός".
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Η ίδια βοηθητική συνάρτηση που χρησιμοποιεί και ο πίνακας ιατρικών κωδικών. Το ορίζουμε
-- ξανά με τον ίδιο ακριβώς ορισμό, ώστε το αρχείο να μπορεί να τρέξει και μόνο του.
create or replace function immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

-- Με cascade, ώστε να μπορεί το αρχείο να ξανατρέξει: η search_hospitals() επιστρέφει
-- setof hospitals και μπλοκάρει το σκέτο drop. Την ξαναφτιάχνουμε παρακάτω.
drop table if exists hospitals cascade;

create table hospitals (
  id      bigserial primary key,

  name    text not null,

  -- Η πόλη ή ο δήμος ("Αθήνα", "Μαρούσι"). Ο γιατρός τη βλέπει δίπλα στην ονομασία, γιατί
  -- υπάρχουν ομώνυμα νοσοκομεία σε διαφορετικές πόλεις.
  area    text not null,

  -- Η περιφέρεια όπως τη χωρίζει ο κατάλογος ("Αττική", "Κρήτη", ...).
  region  text not null,

  -- Δημόσιο νοσοκομείο ή ιδιωτική κλινική.
  type    text not null check (type in ('public', 'private')),

  founded int,

  -- Πεδίο αναζήτησης: πεζά, χωρίς τόνους, ονομασία μαζί με την περιοχή - ώστε να δουλεύει
  -- και το "νοσοκομειο πατρα". Υπολογίζεται μόνο του.
  name_search text generated always as (immutable_unaccent(lower(name || ' ' || area))) stored,

  unique (name, area)
);

create index hospitals_name_search_idx on hospitals using gin (name_search extensions.gin_trgm_ops);

-- ============================================================================
--  Αναζήτηση για το autocomplete της εφαρμογής
--  Παράδειγμα: select * from search_hospitals('ευαγγελισμ');
-- ============================================================================
create or replace function search_hospitals(
  p_query text,
  p_limit int default 20
)
returns setof hospitals
language sql
stable
as $$
  select *
  from hospitals
  where name_search like '%' || immutable_unaccent(lower(p_query)) || '%'
  -- Πρώτα όσα ΑΡΧΙΖΟΥΝ με αυτό που γράφτηκε, μετά τα συντομότερα ονόματα.
  order by
    (immutable_unaccent(lower(name)) like immutable_unaccent(lower(p_query)) || '%') desc,
    length(name),
    name
  limit p_limit;
$$;

-- ============================================================================
--  Δικαιώματα: ο κατάλογος είναι δημόσιος (δεν περιέχει δεδομένα ασθενών), μόνο ανάγνωση.
-- ============================================================================
alter table hospitals enable row level security;

create policy "Ο κατάλογος νοσοκομείων διαβάζεται από όλους"
  on hospitals for select
  using (true);
