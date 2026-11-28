/**
 * DREAMFORGER IndexedDB migration foundation (0.17 preflight).
 * This module is deliberately opt-in: it never changes the active persistence
 * path or deletes localStorage. Migration is a verified shadow copy so the
 * legacy source remains recoverable until a later release explicitly cuts over.
 */
export const DREAMFORGER_DB = 'dreamforger.workspace';
export const DREAMFORGER_DB_VERSION = 1;
const RECORDS = 'records';
const META = 'meta';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function openWorkspaceDatabase(indexedDB = globalThis.indexedDB, databaseName = DREAMFORGER_DB) {
  if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable in this browser context.'));
  if (typeof databaseName !== 'string' || !databaseName.trim() || databaseName.length > 128) return Promise.reject(new TypeError('Invalid workspace database name.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DREAMFORGER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open workspace database'));
    request.onblocked = () => reject(new Error('Database upgrade is blocked by another open Dreamforger tab. Close other tabs and retry.'));
  });
}

export async function readWorkspaceRecord(db, key) {
  if (!db || typeof key !== 'string' || !key) throw new TypeError('A database and non-empty record key are required.');
  const tx = db.transaction(RECORDS, 'readonly');
  return requestResult(tx.objectStore(RECORDS).get(key)).then(row => row?.value ?? null);
}

export async function writeWorkspaceRecords(db, entries) {
  if (!db || !Array.isArray(entries) || entries.length > 100) throw new TypeError('Invalid workspace write batch.');
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' || !entry.key || entry.key.length > 160 || typeof entry.value !== 'string' || entry.value.length > 12_000_000) {
      throw new TypeError('Workspace record failed key or payload bounds.');
    }
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDS, 'readwrite');
    const store = tx.objectStore(RECORDS);
    for (const entry of entries) store.put({ key: entry.key, value: entry.value, updatedAt: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Workspace transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Workspace transaction aborted'));
  });
}

const LEGACY_KEYS = Object.freeze([
  'dreamforge.archive.v1',
  'dreamforge.studio.v1',
  'dreamforger.career-suite.v1',
  'dreamforger.storage-epoch.v1'
]);

/** Read-only inventory: values are not parsed, normalized, or rewritten. */
export function inspectLegacyWorkspace(storage = globalThis.localStorage) {
  if (!storage?.getItem) throw new Error('Legacy browser storage is unavailable.');
  return LEGACY_KEYS.map(key => {
    const value = storage.getItem(key);
    return { key, present: value !== null, characters: value?.length ?? 0, value };
  });
}


async function sha256Hex(value, cryptoProvider=globalThis.crypto){
  if(!cryptoProvider?.subtle?.digest)throw new Error('Web Crypto SHA-256 is unavailable in this browser context.');
  const bytes=new TextEncoder().encode(value);
  const digest=await cryptoProvider.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Read-only migration preview. It does not parse, rewrite or delete source data. */
export async function previewLegacyWorkspaceMigration({storage=globalThis.localStorage,cryptoProvider=globalThis.crypto}={}){
  const inventory=inspectLegacyWorkspace(storage);
  const records=await Promise.all(inventory.map(async item=>({
    key:item.key,present:item.present,characters:item.characters,
    estimatedBytes:item.present?(item.key.length+item.characters)*2:0,
    sha256:item.present?await sha256Hex(item.value,cryptoProvider):null
  })));
  return Object.freeze({status:'preview-only',sourceUnchanged:true,checksumAlgorithm:'SHA-256',recordCount:records.filter(x=>x.present).length,totalCharacters:records.reduce((sum,x)=>sum+x.characters,0),estimatedBytes:records.reduce((sum,x)=>sum+x.estimatedBytes,0),records:Object.freeze(records.map(Object.freeze))});
}

/**
 * Verified shadow migration. Every source string is copied byte-for-byte as a
 * JS string, read back, and compared. The old keys are never removed here.
 */
export async function shadowMigrateLegacyWorkspace({ db, storage = globalThis.localStorage, now = () => new Date().toISOString(), cryptoProvider = globalThis.crypto }) {
  if (!db) throw new TypeError('An opened IndexedDB database is required.');
  const inventory = inspectLegacyWorkspace(storage);
  const entries = await Promise.all(inventory.filter(item => item.present).map(async item => ({ key: `legacy:${item.key}`, value: item.value, sourceKey:item.key, sha256:await sha256Hex(item.value,cryptoProvider) })));
  const manifest = { version: 1, status: 'copying', checksumAlgorithm:'SHA-256', startedAt: now(), keys: entries.map(({ key, value, sourceKey, sha256 }) => ({ key, sourceKey, characters: value.length, estimatedBytes:(sourceKey.length+value.length)*2, sha256 })) };
  await new Promise((resolve, reject) => {
    const tx = db.transaction([RECORDS, META], 'readwrite');
    const records = tx.objectStore(RECORDS);
    const meta = tx.objectStore(META);
    for (const entry of entries) records.put({ key: entry.key, value: entry.value, updatedAt: now() });
    meta.put({ key: 'migration:localStorage:v1', value: manifest });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Migration transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Migration transaction aborted'));
  });
  for (const entry of entries) {
    const copied = await readWorkspaceRecord(db, entry.key);
    if (copied !== entry.value || await sha256Hex(copied,cryptoProvider)!==entry.sha256) throw new Error(`Migration verification failed for ${entry.key}. Legacy data was not modified.`);
  }
  const complete = { ...manifest, status: 'verified-shadow-copy', verifiedAt: now() };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put({ key: 'migration:localStorage:v1', value: complete });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Could not commit migration verification marker'));
    tx.onabort = () => reject(tx.error || new Error('Migration marker transaction aborted'));
  });
  return { status: complete.status, copiedKeys: entries.length, totalCharacters: entries.reduce((sum, item) => sum + item.value.length, 0), checksumAlgorithm:'SHA-256', legacyRetained: true };
}
