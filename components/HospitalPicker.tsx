import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { COLORS } from '../constants/colors';
import { TYPOGRAPHY } from '../constants/designSystem';
import { CatalogPicker } from './CatalogPicker';
import { searchHospitals, Hospital } from '../services/hospitals';

interface Props {
  value: Hospital | null;
  onChange: (hospital: Hospital | null) => void;
  inputStyle?: StyleProp<TextStyle>;
  resultsMaxHeight?: number;
}

// Ο κατάλογος δεν καλύπτει κάθε ιδιωτική κλινική της χώρας. Χωρίς διέξοδο, ένας γιατρός που
// δεν βρίσκει την κλινική του δεν θα μπορούσε καθόλου να καταχωρήσει τη νοσηλία - οπότε
// κρατάμε ό,τι έγραψε, ως εγγραφή χωρίς πόλη.
const freeTextHospital = (text: string): Hospital => ({
  id: -1,
  name: text,
  area: '',
  region: '',
  type: 'public',
  founded: null,
});

// Επιλογή νοσοκομείου ή ιδιωτικής κλινικής από τον κατάλογο. Η περιοχή φαίνεται δίπλα στην
// ονομασία γιατί υπάρχουν ομώνυμα σε διαφορετικές πόλεις (π.χ. Γενικό Νοσοκομείο "Άγιος
// Ανδρέας"), και η ένδειξη "Ιδιωτική" ξεχωρίζει τις κλινικές από τα δημόσια.
export function HospitalPicker({ value, onChange, inputStyle, resultsMaxHeight }: Props) {
  return (
    <CatalogPicker<Hospital>
      search={(query) => searchHospitals(query)}
      value={value}
      onChange={onChange}
      keyOf={(item) => String(item.id)}
      placeholder="Τουλ. 2 χαρακτήρες..."
      emptyText="Δεν βρέθηκε νοσοκομείο ή κλινική."
      onFreeText={freeTextHospital}
      inputStyle={inputStyle}
      resultsMaxHeight={resultsMaxHeight}
      renderRow={(item) => (
        <>
          <Text style={localStyles.name}>{item.name}</Text>
          <Text style={localStyles.detail}>
            {item.area}{item.type === 'private' ? ' · Ιδιωτική' : ''}
          </Text>
        </>
      )}
      renderSelected={(item) => (
        <>
          <Text style={localStyles.selectedName}>{item.name}</Text>
          {!!item.area && (
            <Text style={localStyles.detail}>
              {item.area}{item.type === 'private' ? ' · Ιδιωτική' : ''}
            </Text>
          )}
        </>
      )}
    />
  );
}

const localStyles = StyleSheet.create({
  name: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.text },
  selectedName: { fontSize: TYPOGRAPHY.bodyText, color: COLORS.text },
  detail: { fontSize: TYPOGRAPHY.secondaryText, color: COLORS.primary, marginTop: 2 },
});
