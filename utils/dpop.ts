import * as Crypto from 'expo-crypto';
import { ec as EC } from 'elliptic';
import { Buffer } from 'buffer';

const ec = new EC('p256');
let keyPair: any = null;

const base64urlEncode = (data: Uint8Array | Buffer | string): string => {
  const buf = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const getKeyPair = () => {
  if (!keyPair) {
    keyPair = ec.genKeyPair();
  }
  return keyPair;
};

export const createDpopToken = async (method: string, url: string): Promise<string> => {
  const kp = getKeyPair();
  const publicKey = kp.getPublic();

  const x = base64urlEncode(publicKey.getX().toArrayLike(Buffer, 'be', 32));
  const y = base64urlEncode(publicKey.getY().toArrayLike(Buffer, 'be', 32));

  const header = {
    alg: 'ES256',
    typ: 'dpop+jwt',
    jwk: { kty: 'EC', crv: 'P-256', x, y }
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

  // Υπογραφή με το private key
  const signature = kp.sign(msgHash);
  const r = signature.r.toArrayLike(Buffer, 'be', 32);
  const s = signature.s.toArrayLike(Buffer, 'be', 32);
  const sigBytes = Buffer.concat([r, s]);

  return `${signingInput}.${base64urlEncode(sigBytes)}`;
};
