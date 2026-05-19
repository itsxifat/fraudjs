import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import envPaths from 'env-paths';
import { FraudJSError } from './errors.js';

const PATHS = envPaths('fraudjs', { suffix: '' });
const STORE_PATH = path.join(PATHS.config, 'credentials.json');
const KEY_PATH = path.join(PATHS.config, 'master.key');

// ---------- key management ----------

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'fraudjs-salt-v1', 32);
}

async function getEncryptionKey() {
  const secret = process.env.FRAUDJS_SECRET;
  if (secret) return deriveKey(secret);

  // No env secret → use or generate a persistent machine key
  try {
    const hex = await fs.readFile(KEY_PATH, 'utf8');
    return Buffer.from(hex.trim(), 'hex');
  } catch {
    const key = crypto.randomBytes(32);
    await fs.mkdir(path.dirname(KEY_PATH), { recursive: true });
    await fs.writeFile(KEY_PATH, key.toString('hex'), { mode: 0o600 });
    return key;
  }
}

// ---------- AES-256-GCM helpers ----------

function encryptPassword(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptPassword(encoded, key) {
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new FraudJSError('Invalid credential encoding — store may be corrupted');
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new FraudJSError('Failed to decrypt credentials — wrong FRAUDJS_SECRET or corrupted store');
  }
}

// ---------- file store ----------

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function writeStore(records) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(records, null, 2), { mode: 0o600 });
}

// ---------- public API ----------

export async function addCredential({ email, password }) {
  if (!email || !password) throw new FraudJSError('email and password are required');
  const key = await getEncryptionKey();
  const records = await readStore();
  const idx = records.findIndex(r => r.email === email);
  const entry = { email, encryptedPassword: encryptPassword(password, key) };
  if (idx >= 0) records[idx] = entry;
  else records.push(entry);
  await writeStore(records);
}

/** Returns emails only — never passwords. */
export async function listCredentials() {
  return (await readStore()).map(r => r.email);
}

export async function removeCredential(email) {
  const records = await readStore();
  const filtered = records.filter(r => r.email !== email);
  if (filtered.length === records.length) throw new FraudJSError(`No credential found for ${email}`);
  await writeStore(filtered);
}

export async function getStoredCredentials() {
  const records = await readStore();
  if (records.length === 0) return [];
  const key = await getEncryptionKey();
  return records.map(r => ({ email: r.email, password: decryptPassword(r.encryptedPassword, key) }));
}

// FRAUDJS_CREDENTIALS=email:pass,email:pass — first colon is the delimiter
export function getEnvCredentials() {
  const raw = process.env.FRAUDJS_CREDENTIALS;
  if (!raw) return [];
  return raw.split(',').flatMap(pair => {
    const colon = pair.indexOf(':');
    if (colon === -1) return [];
    return [{ email: pair.slice(0, colon).trim(), password: pair.slice(colon + 1).trim() }];
  });
}

export async function getAllCredentials() {
  const envCreds = getEnvCredentials();
  const storedCreds = await getStoredCredentials();
  const seen = new Set(envCreds.map(c => c.email));
  return [...envCreds, ...storedCreds.filter(c => !seen.has(c.email))];
}
