/**
 * Storage boundary used by the domain store. Browser builds use IndexedDB;
 * the Electron preload transparently routes the same contract through
 * validated IPC to SQLite without exposing filesystem access to React.
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

function desktopStorage<T>(): StorageAdapter<T> | null {
  if (typeof window === "undefined" || !window.academyDesktop) return null;
  return {
    async load() {
      return (await window.academyDesktop?.database.load()) as T | undefined;
    },
    async save(value) {
      await window.academyDesktop?.database.save(value);
    },
  };
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
      const desktop = desktopStorage<T>();
      if (desktop) return desktop.load();
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
      const desktop = desktopStorage<T>();
      if (desktop) return desktop.save(value);
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
