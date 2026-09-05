import { useState, useEffect, useCallback } from "react";

const DB_NAME = "ela_foods_offline";
const DB_VERSION = 1;

interface OfflineData {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
  synced: boolean;
}

export function useOfflineStorage() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [pendingSync, setPendingSync] = useState<number>(0);

  // Initialize IndexedDB
  useEffect(() => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB");
    };

    request.onsuccess = () => {
      setDb(request.result);
      countPendingItems(request.result);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Create object stores
      if (!database.objectStoreNames.contains("offline_data")) {
        const store = database.createObjectStore("offline_data", { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
      }

      if (!database.objectStoreNames.contains("cached_assignments")) {
        database.createObjectStore("cached_assignments", { keyPath: "id" });
      }
    };

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const countPendingItems = async (database: IDBDatabase) => {
    try {
      const transaction = database.transaction(["offline_data"], "readonly");
      const store = transaction.objectStore("offline_data");
      const request = store.getAll();
      
      request.onsuccess = () => {
        // Filter items where synced is false (boolean keys don't work with IDBKeyRange)
        const pendingItems = (request.result || []).filter((item: OfflineData) => item.synced === false);
        setPendingSync(pendingItems.length);
      };
      
      request.onerror = () => {
        console.error("Failed to count pending items");
        setPendingSync(0);
      };
    } catch (error) {
      console.error("IndexedDB error in countPendingItems:", error);
      setPendingSync(0);
    }
  };

  // Save data for offline use
  const saveOffline = useCallback(async (type: string, data: unknown): Promise<string> => {
    if (!db) return "";

    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const offlineData: OfflineData = {
      id,
      type,
      data,
      timestamp: Date.now(),
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["offline_data"], "readwrite");
      const store = transaction.objectStore("offline_data");
      const request = store.put(offlineData);

      request.onsuccess = () => {
        countPendingItems(db);
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  // Get all pending items for sync
  const getPendingItems = useCallback(async (): Promise<OfflineData[]> => {
    if (!db) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(["offline_data"], "readonly");
        const store = transaction.objectStore("offline_data");
        const request = store.getAll();

        request.onsuccess = () => {
          // Filter items where synced is false (boolean keys don't work with IDBKeyRange)
          const pendingItems = (request.result || []).filter((item: OfflineData) => item.synced === false);
          resolve(pendingItems);
        };
        request.onerror = () => reject(request.error);
      } catch (error) {
        console.error("IndexedDB error in getPendingItems:", error);
        resolve([]);
      }
    });
  }, [db]);

  // Mark item as synced
  const markSynced = useCallback(async (id: string): Promise<void> => {
    if (!db) return;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["offline_data"], "readwrite");
      const store = transaction.objectStore("offline_data");
      const request = store.get(id);

      request.onsuccess = () => {
        const data = request.result;
        if (data) {
          data.synced = true;
          store.put(data);
          countPendingItems(db);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  // Cache assignments for offline viewing
  const cacheAssignments = useCallback(async <T extends { id: string }>(assignments: T[]): Promise<void> => {
    if (!db) return;

    const transaction = db.transaction(["cached_assignments"], "readwrite");
    const store = transaction.objectStore("cached_assignments");

    // Clear existing and add new
    store.clear();
    assignments.forEach((assignment) => {
      store.put(assignment);
    });
  }, [db]);

  // Get cached assignments
  const getCachedAssignments = useCallback(async <T>(): Promise<T[]> => {
    if (!db) return [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["cached_assignments"], "readonly");
      const store = transaction.objectStore("cached_assignments");
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }, [db]);

  // Clear all synced items
  const clearSyncedItems = useCallback(async (): Promise<void> => {
    if (!db) return;

    const pendingItems = await getPendingItems();
    const syncedIds = (await new Promise<OfflineData[]>((resolve, reject) => {
      const transaction = db.transaction(["offline_data"], "readonly");
      const store = transaction.objectStore("offline_data");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })).filter(item => item.synced).map(item => item.id);

    const transaction = db.transaction(["offline_data"], "readwrite");
    const store = transaction.objectStore("offline_data");
    syncedIds.forEach(id => store.delete(id));
  }, [db, getPendingItems]);

  return {
    isOnline,
    pendingSync,
    saveOffline,
    getPendingItems,
    markSynced,
    cacheAssignments,
    getCachedAssignments,
    clearSyncedItems,
  };
}
