import * as Crypto from 'expo-crypto';
import { p256 } from '@noble/curves/nist.js';
import { Buffer } from 'buffer';

// Η υπογραφή γίνεται με @noble/curves και όχι με elliptic. Η elliptic κάνει την αριθμητική
// μεγάλων ακεραίων με βρόχους JavaScript, που στον Hermes τρέχουν στον διερμηνέα χωρίς JIT:
// μετρήθηκαν 150-240ms ανά υπογραφή στη συσκευή, έναντι 2ms στον υπολογιστή. Η @noble/curves
// στηρίζεται στο BigInt, που ο Hermes το υλοποιεί σε C++, οπότε δεν πληρώνει τον διερμηνέα.

// Το ζεύγος κλειδιών φτιάχνεται μία φορά ανά συνεδρία και μένει ΜΟΝΟ στη μνήμη. Το διακριτικό
// πρόσβασης που παίρνουμε στη σύνδεση είναι δεμένο με αυτό ακριβώς το κλειδί, οπότε αν άλλαζε
// στη μέση της συνεδρίας ο διακομιστής θα απέρριπτε κάθε επόμενο αίτημα.
let secretKey: Uint8Array | null = null;
let publicJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string } | null = null;

const base64urlEncode = (data: Uint8Array | Buffer | string): string => {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

// Το expo-crypto επιστρέφει το hash ως δεκαεξαδικό κείμενο, ενώ η υπογραφή θέλει bytes.
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const getKeys = () => {
  if (!secretKey || !publicJwk) {
    secretKey = p256.utils.randomSecretKey();

    // Ασυμπίεστο σημείο: πρώτο byte 0x04, μετά 32 bytes X και 32 bytes Y. Το JWK υπολογίζεται
    // μία φορά, αφού το κλειδί δεν αλλάζει όσο κρατά η συνεδρία.
    const publicKey = p256.getPublicKey(secretKey, false);
    publicJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: base64urlEncode(publicKey.slice(1, 33)),
      y: base64urlEncode(publicKey.slice(33, 65)),
    };
  }
  return { secretKey, publicJwk };
};

export const createDpopToken = async (method: string, url: string): Promise<string> => {
  const { secretKey: sk, publicJwk: jwk } = getKeys();

  const header = {
    alg: 'ES256',
    typ: 'dpop+jwt',
    jwk,
  };

  const jti = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    Math.random().toString() + Date.now()
  );

  const payload = {
    jti,
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64  = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Hashing του signingInput
  const msgHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    signingInput,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  // Υπογραφή με το private key. Το prehash: false λέει ότι δίνουμε ήδη έτοιμο hash, ώστε να
  // μην ξαναπεράσει το μήνυμα από SHA-256. Το αποτέλεσμα είναι 64 bytes, r και s μαζί, που
  // είναι ακριβώς η μορφή που περιμένει το ES256.
  const sigBytes = p256.sign(hexToBytes(msgHash), sk, { prehash: false });

  return `${signingInput}.${base64urlEncode(sigBytes)}`;
};
