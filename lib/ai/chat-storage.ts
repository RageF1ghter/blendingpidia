// Chat history persistence in IndexedDB. Failures never fall back to the
// business localStorage key; the session continues in memory with an error flag.

import type { AiProvider, ProviderToolCall } from './contracts';

export const chatDbName = 'blendingpidia-ai-v1';
export const chatStoreName = 'messages';

export type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  provider?: AiProvider;
  toolCalls?: ProviderToolCall[];
  toolCallId?: string;
  createdAt: string;
  kind?: 'error' | 'notice';
};

type ChatDb = IDBDatabase;

let dbPromise: Promise<ChatDb | null> | null = null;

function openDb(): Promise<ChatDb | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(chatDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(chatStoreName)) {
        const store = db.createObjectStore(chatStoreName, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function newMessageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function appendChatMessage(message: StoredChatMessage): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(chatStoreName, 'readwrite');
    await requestToPromise(tx.objectStore(chatStoreName).put(message));
    return true;
  } catch {
    return false;
  }
}

export async function loadChatMessages(): Promise<StoredChatMessage[] | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(chatStoreName, 'readonly');
    const store = tx.objectStore(chatStoreName);
    const index = store.index('createdAt');
    const all = await requestToPromise(index.getAll());
    return (all as StoredChatMessage[]).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  } catch {
    return null;
  }
}

export async function clearChatMessages(): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(chatStoreName, 'readwrite');
    await requestToPromise(tx.objectStore(chatStoreName).clear());
    return true;
  } catch {
    return false;
  }
}
