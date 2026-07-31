// ============================================================================
// GOS HELPERS & CACHE UTILITIES
// ============================================================================

const DB_NAME = 'gos-pwa-db';
const DB_VERSION = 1;

export function initIndexedDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            console.warn("Este navegador no soporta IndexedDB.");
            resolve(null);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('orders')) {
                db.createObjectStore('orders', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('clients')) {
                db.createObjectStore('clients', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('locations')) {
                db.createObjectStore('locations', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('config')) {
                db.createObjectStore('config', { keyPath: 'key' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function getDB() {
    if (!window.gosDB) {
        window.gosDB = await initIndexedDB();
    }
    return window.gosDB;
}

export async function dbSet(storeName, key, value) {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const data = typeof value === 'object' ? { ...value } : { value };
        if (key) {
            if (store.keyPath === 'id') data.id = key;
            else if (store.keyPath === 'key') data.key = key;
        }
        const request = store.put(data);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function dbGetAll(storeName) {
    const db = await getDB();
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

export async function dbClear(storeName) {
    const db = await getDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

export let wakeLockInstance = null;

export async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLockInstance = await navigator.wakeLock.request('screen');
            console.log('💡 Wake Lock de pantalla adquirido con éxito para mantener la PWA activa.');
        }
    } catch (err) {
        console.warn(`⚠️ No se pudo adquirir Wake Lock: ${err.message}`);
    }
}

export function releaseWakeLock() {
    if (wakeLockInstance !== null) {
        wakeLockInstance.release().then(() => {
            wakeLockInstance = null;
            console.log('💡 Wake Lock de pantalla liberado.');
        });
    }
}

export function levenshteinDistance(s, t) {
    if (!s || !t) return 99;
    const d = [];
    const n = s.length;
    const m = t.length;
    if (n === 0) return m;
    if (m === 0) return n;
    for (let i = 0; i <= n; i++) d[i] = [i];
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + cost
            );
        }
    }
    return d[n][m];
}

export function isApproximateMatch(query, text) {
    const q = query.toLowerCase().trim();
    const t = text.toLowerCase().trim();
    if (t.includes(q)) return true;

    const wordsQ = q.split(/\s+/);
    const wordsT = t.split(/\s+/);

    for (let wq of wordsQ) {
        if (wq.length < 3) continue;
        for (let wt of wordsT) {
            if (wt.length < 3) continue;
            const dist = levenshteinDistance(wq, wt);
            if (dist <= 1 || (wq.length > 5 && dist <= 2)) {
                return true;
            }
        }
    }
    return false;
}

export function isExtraordinarySlot(dateStr, slotStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    if (dow === 0) return true; // Sunday is always extraordinary

    const match = (slotStr || '').match(/(\d{2}):(\d{2})/);
    if (!match) return false;
    const hour = parseInt(match[1]);

    if (dow === 6) {
        return hour >= 12;
    }
    return hour < 8 || hour >= 17;
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la tierra en metros
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en metros
}

export function classifyTravel(direccion, division) {
    if (!direccion) return "Trabajo Local";
    const dirNormalized = direccion.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const motoCities = ["villanueva", "choloma", "cofradia", "naco", "el progreso", "progreso"];
    const largoCities = ["tela", "puerto cortes", "santa rosa de copan", "copan", "gracias", "ocotepeque", "la entrada"];

    for (let city of largoCities) {
        if (dirNormalized.includes(city)) {
            return "Viaje largo";
        }
    }
    for (let city of motoCities) {
        if (dirNormalized.includes(city)) {
            return "Viaje en moto";
        }
    }
    return "Trabajo Local";
}
