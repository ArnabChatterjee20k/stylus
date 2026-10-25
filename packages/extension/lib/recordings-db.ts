/** Recordings live in IndexedDB on the extension's origin, shared by the offscreen recorder and the library page. */

export type Recording = {
  id: string;
  title: string;
  /** Page the recording was made on. */
  url: string;
  createdAt: number;
  durationMs: number;
  width: number;
  height: number;
  mime: string;
  size: number;
  blob: Blob;
  /** Small JPEG of the first frame, as a data URL. */
  thumbnail?: string;
};

const DB = 'stylus-recordings';
const STORE = 'recordings';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export const saveRecording = (r: Recording) => run('readwrite', (s) => s.put(r)).then(() => r.id);
export const getRecording = (id: string) => run<Recording | undefined>('readonly', (s) => s.get(id));
export const deleteRecording = (id: string) => run('readwrite', (s) => s.delete(id));
export const listRecordings = async () =>
  ((await run<Recording[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.createdAt - a.createdAt);

export async function renameRecording(id: string, title: string) {
  const r = await getRecording(id);
  if (r) await saveRecording({ ...r, title });
}

export const extensionFor = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');
