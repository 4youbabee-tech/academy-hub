/**
 * Storage boundary used by the domain store. Browser-specific IndexedDB code
 * lives here so a future Electron adapter can use IPC/SQLite without touching
 * React screens or business rules.
 */
export interface StorageAdapter<T> {
  load(): Promise<T | undefined>;
  save(value: T): Promise<void>;
}

export interface IndexedDbStorageOptions {
  databaseName: string;
  storeName: string;
  key: IDBValidKey;
}

export function createIndexedDbStorage<T>(options: IndexedDbStorageOptions): StorageAdapter<T> {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(options.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(options.storeName)) {
          request.result.createObjectStore(options.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async load(): Promise<T | undefined> {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(options.storeName, "readonly");
        const request = transaction.objectStore(options.storeName).get(options.key);
        request.onsuccess = () => {
          const value = request.result as T | undefined;
          database.close();
          resolve(value);
        };
        request.onerror = () => {
          database.close();
          reject(request.error);
        };
      });
    },

    async save(value: T): Promise<void> {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(options.storeName, "readwrite");
        transaction.objectStore(options.storeName).put(value, options.key);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      });
    },
  };
}
