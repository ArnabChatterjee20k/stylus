import type { ShotSettings } from './shot-settings';

/** Screenshots, kept with their styling so they can be re-edited. IndexedDB on the extension origin. */
export type Capture = {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  /** The raw screenshot (PNG), never modified. */
  image: Blob;
  width: number;
  height: number;
  /** Screenshot pixels per CSS pixel. */
  density: number;
  settings?: ShotSettings;
};

const DB = 'stylus-captures';
const STORE = 'captures';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => reject(t.error);
  });
}

export const saveCapture = (c: Capture) => run('readwrite', (s) => s.put(c)).then(() => c.id);
export const getCapture = (id: string) => run<Capture | undefined>('readonly', (s) => s.get(id));
export const deleteCapture = (id: string) => run('readwrite', (s) => s.delete(id));
export const listCaptures = async () => ((await run<Capture[]>('readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.createdAt - a.createdAt);

export async function updateCapture(id: string, patch: Partial<Pick<Capture, 'title' | 'settings'>>) {
  const c = await getCapture(id);
  if (c) await saveCapture({ ...c, ...patch });
}
