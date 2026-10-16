import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit nonce recommended for AES-GCM (NIST SP 800-38D)
const TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
const REQUIRED_KEY_BYTES = 32; // 256 bits for AES-256

/**
 * Validates and converts a raw encryption key string into a 32-byte Buffer.
 * Supports:
 * - 64-character hexadecimal strings (e.g., from crypto.randomBytes(32).toString('hex'))
 * - 44-character Base64 strings (representing 32 bytes)
 * - Raw 32-byte Buffer
 *
 * @param {string|Buffer} rawKey - The key to validate.
 * @returns {Buffer} The 32-byte key buffer.
 * @throws {Error} If key is missing, invalid format, or not exactly 32 bytes.
 */
export function validateKey(rawKey) {
  if (!rawKey) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required and must not be empty.');
  }

  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== REQUIRED_KEY_BYTES) {
      throw new Error(`Invalid TOKEN_ENCRYPTION_KEY length: expected ${REQUIRED_KEY_BYTES} bytes, got ${rawKey.length} bytes.`);
    }
    return rawKey;
  }

  if (typeof rawKey !== 'string') {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a string or Buffer.');
  }

  const trimmed = rawKey.trim();

  // 1. Check for 64-character hexadecimal string
  if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 2. Check for Base64 encoded 32 bytes (typically 44 chars with padding, or 43 without)
  if (trimmed.length === 44 || trimmed.length === 43) {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === REQUIRED_KEY_BYTES) {
      return buf;
    }
  }

  // 3. Fallback: Check raw UTF-8 byte length
  const utf8Buf = Buffer.from(trimmed, 'utf8');
  if (utf8Buf.length === REQUIRED_KEY_BYTES) {
    return utf8Buf;
  }

  throw new Error(
    `Invalid TOKEN_ENCRYPTION_KEY: expected 32 bytes (e.g. 64 hex characters or 44 base64 characters), but received ${utf8Buf.length} bytes. ` +
    `Generate one using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  );
}

/**
 * Retrieves the master encryption key from the environment.
 * Rejects with an error if missing. Never provides a fallback.
 *
 * @returns {Buffer} 32-byte encryption key buffer.
 */
function getMasterKey() {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  return validateKey(envKey);
}

/**
 * Encrypts sensitive text using AES-256-GCM with a unique, cryptographically random IV.
 *
 * @param {string} plaintext - The sensitive text to encrypt (e.g. OAuth access or refresh token).
 * @param {string|Buffer|null} [keyOverride=null] - Optional key for testing or rotation.
 * @returns {{ encryptedData: string, iv: string, authTag: string }} Hex-encoded cipher object.
 */
export function encrypt(plaintext, keyOverride = null) {
  if (plaintext === undefined || plaintext === null) {
    throw new Error('Cannot encrypt undefined or null data.');
  }

  const textToEncrypt = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const key = keyOverride ? validateKey(keyOverride) : getMasterKey();

  // Generate a cryptographically secure, unique 96-bit IV for every encryption call
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(textToEncrypt, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts an AES-256-GCM cipher payload and verifies authenticity.
 * Rejects tampered ciphertexts, altered IVs, incorrect auth tags, and wrong keys.
 *
 * @param {{ encryptedData: string, iv: string, authTag: string }|string} payload - Hex cipher object or serialized string (iv:authTag:encryptedData).
 * @param {string|Buffer|null} [keyOverride=null] - Optional key for testing or rotation.
 * @returns {string} The original decrypted plaintext.
 * @throws {Error} If authentication fails or payload is invalid.
 */
export function decrypt(payload, keyOverride = null) {
  if (!payload) {
    throw new Error('Payload required for decryption.');
  }

  let encryptedData;
  let iv;
  let authTag;

  // Support serialized compact string: "iv:authTag:encryptedData"
  if (typeof payload === 'string') {
    const parts = payload.split(':');
    if (parts.length === 3) {
      iv = parts[0];
      authTag = parts[1];
      encryptedData = parts[2];
    } else {
      throw new Error('Invalid serialized ciphertext format. Expected iv:authTag:encryptedData.');
    }
  } else if (typeof payload === 'object') {
    encryptedData = payload.encryptedData;
    iv = payload.iv;
    authTag = payload.authTag;
  }

  if (!encryptedData || !iv || !authTag) {
    throw new Error('Invalid payload: encryptedData, iv, and authTag must all be provided.');
  }

  const key = keyOverride ? validateKey(keyOverride) : getMasterKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const authTagBuf = Buffer.from(authTag, 'hex');
  const encryptedBuf = Buffer.from(encryptedData, 'hex');

  if (ivBuf.length !== IV_LENGTH_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH_BYTES} bytes, got ${ivBuf.length} bytes.`);
  }

  if (authTagBuf.length !== TAG_LENGTH_BYTES) {
    throw new Error(`Invalid authentication tag length: expected ${TAG_LENGTH_BYTES} bytes, got ${authTagBuf.length} bytes.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(authTagBuf);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuf),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: authentication tag mismatch or corrupted ciphertext (${error.message}).`);
  }
}

/**
 * Serializes a cipher object into a compact, single-string representation: "iv:authTag:encryptedData".
 *
 * @param {{ encryptedData: string, iv: string, authTag: string }} cipherObj
 * @returns {string} Compact serialized ciphertext.
 */
export function serializeCipher(cipherObj) {
  if (!cipherObj || !cipherObj.iv || !cipherObj.authTag || !cipherObj.encryptedData) {
    throw new Error('Cannot serialize incomplete cipher object.');
  }
  return `${cipherObj.iv}:${cipherObj.authTag}:${cipherObj.encryptedData}`;
}

export default {
  validateKey,
  encrypt,
  decrypt,
  serializeCipher
};
