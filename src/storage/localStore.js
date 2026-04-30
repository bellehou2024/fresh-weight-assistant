const DB_NAME = "fresh-weight-assistant";
const DB_VERSION = 1;
const STORES = ["dailyLogs", "foodEntries", "exerciseEntries", "profile", "syncQueue"];

export function createMemoryAdapter() {
  const buckets = new Map(STORES.map((name) => [name, new Map()]));

  return {
    async get(storeName, key) {
      return buckets.get(storeName)?.get(key) ?? null;
    },
    async put(storeName, value, key) {
      buckets.get(storeName).set(key ?? value.id ?? value.date, structuredClone(value));
    },
    async listByIndex(storeName, indexName, value) {
      return [...buckets.get(storeName).values()]
        .filter((item) => item[indexName] === value)
        .sort((a, b) => String(a.createdAt ?? a.id).localeCompare(String(b.createdAt ?? b.id)));
    },
    async list(storeName) {
      return [...buckets.get(storeName).values()];
    }
  };
}

export function createIndexedDbAdapter() {
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const storeName of STORES) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName);
            if (["foodEntries", "exerciseEntries"].includes(storeName)) {
              store.createIndex("date", "date", { unique: false });
            }
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function transaction(storeName, mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    async get(storeName, key) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async put(storeName, value, key) {
      return transaction(storeName, "readwrite", (store) => store.put(value, key ?? value.id ?? value.date));
    },
    async listByIndex(storeName, indexName, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).index(indexName).getAll(value);
        request.onsuccess = () => {
          resolve((request.result ?? []).sort((a, b) => String(a.createdAt ?? a.id).localeCompare(String(b.createdAt ?? b.id))));
        };
        request.onerror = () => reject(request.error);
      });
    },
    async list(storeName) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error);
      });
    }
  };
}

export function createLocalStore(adapter = createIndexedDbAdapter()) {
  return {
    saveProfile(profile) {
      return adapter.put("profile", { ...profile, updatedAt: new Date().toISOString() }, "me");
    },
    getProfile() {
      return adapter.get("profile", "me");
    },
    saveDailyLog(log) {
      return adapter.put("dailyLogs", { ...log, updatedAt: new Date().toISOString() }, log.date);
    },
    getDailyLog(date) {
      return adapter.get("dailyLogs", date);
    },
    saveFoodEntry(entry) {
      return adapter.put("foodEntries", withDefaults(entry), entry.id);
    },
    listFoodEntries(date) {
      return adapter.listByIndex("foodEntries", "date", date);
    },
    listAllFoodEntries() {
      return adapter.list("foodEntries");
    },
    saveExerciseEntry(entry) {
      return adapter.put("exerciseEntries", withDefaults(entry), entry.id);
    },
    listExerciseEntries(date) {
      return adapter.listByIndex("exerciseEntries", "date", date);
    },
    listAllExerciseEntries() {
      return adapter.list("exerciseEntries");
    },
    listDailyLogs() {
      return adapter.list("dailyLogs");
    }
  };
}

function withDefaults(entry) {
  const now = new Date().toISOString();
  return {
    ...entry,
    createdAt: entry.createdAt ?? now,
    updatedAt: now,
    syncStatus: entry.syncStatus ?? "local"
  };
}
