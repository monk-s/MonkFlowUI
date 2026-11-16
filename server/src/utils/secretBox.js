/**
 * Encrypt client documents before they are stored (AES-256-GCM).
 *
 *   const sealed = seal(pdfBuffer, orgId);
 *   const pdf = open(sealed, orgId);
 *
 * The key is DOCUMENT_KEY: 64 hex characters (32 bytes), e.g. from
 * `openssl rand -hex 32`. The workspace id is bound into each ciphertext, so
 * a row copied into another workspace does not decrypt.
 *
 * Layout: 1 byte version | 12 byte IV | 16 byte tag | ciphertext.
 * shortcut: one key, no rotation. To rotate, add a version 2 key and
 * re-encrypt rows still on version 1.
 */
const crypto = require('crypto');

function key() {
  const hex = process.env.DOCUMENT_KEY || '';
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}

const configured = () => !!key();

function seal(plain, orgId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(String(orgId)));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
}

function open(sealed, orgId) {
  if (sealed[0] !== 1) throw new Error('secretBox: unknown version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), sealed.subarray(1, 13));
  decipher.setAAD(Buffer.from(String(orgId)));
  decipher.setAuthTag(sealed.subarray(13, 29));
  return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]);
}

module.exports = { configured, seal, open };
