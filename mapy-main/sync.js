/* ==========================================================================
   Orlen SFA – warstwa synchronizacji na żywo między handlowcami (Firebase)
   ==========================================================================

   PO CO TO JEST:
   Aplikacja stoi na GitHub Pages (hosting statyczny – bez własnego serwera).
   Żeby zmiana zrobiona przez jednego handlowca (status stacji, przypisanie,
   notatka) była NATYCHMIAST widoczna u pozostałych, potrzebna jest wspólna
   baza w chmurze. Używamy darmowego Firebase Firestore.

   JAK WŁĄCZYĆ (jednorazowo, ~5 minut):
   1. Wejdź na https://console.firebase.google.com i utwórz projekt.
   2. W projekcie: "Build → Firestore Database → Create database"
      (wybierz region europe-central2 lub eur3, tryb testowy na start).
   3. "Project settings → General → Your apps → Web (</>)": zarejestruj
      aplikację i skopiuj obiekt firebaseConfig.
   4. Wklej wartości poniżej (zamiast "WKLEJ_...").
   5. W zakładce Firestore → Rules ustaw (na czas testów):
        rules_version = '2';
        service cloud.firestore {
          match /databases/{db}/documents {
            match /{document=**} { allow read, write: if true; }
          }
        }
      (Docelowo warto ograniczyć dostęp – to prosta, otwarta reguła na start.)

   Jeśli poniższe pola zostaną z "WKLEJ_..." – aplikacja działa normalnie,
   tylko lokalnie (zapisy w pamięci przeglądarki, bez współdzielenia).
   ========================================================================== */

window.ORLEN_FIREBASE_CONFIG = {
    apiKey: "WKLEJ_API_KEY",
    authDomain: "WKLEJ_AUTH_DOMAIN",
    projectId: "WKLEJ_PROJECT_ID",
    storageBucket: "WKLEJ_STORAGE_BUCKET",
    messagingSenderId: "WKLEJ_SENDER_ID",
    appId: "WKLEJ_APP_ID"
};

// Pola stacji, które są współdzielone między handlowcami (delta, nie cała baza)
const SYNC_FIELDS = ['Status', 'Handlowiec', 'Notatki', 'Ostatnia_Aktualizacja'];
const COLLECTION_NAME = 'stacje';

window.OrlenSync = (function () {
    let enabled = false;
    let db = null;
    let fsApi = null;               // funkcje Firestore (doc, setDoc, ...)
    let onRemoteChangeCb = null;
    const lastSent = {};            // id -> JSON pól (do wykrywania zmian)
    let pushTimer = null;
    let applyingRemote = false;

    function configLooksValid(cfg) {
        if (!cfg) return false;
        return Object.values(cfg).every(v => typeof v === 'string' && v && !v.startsWith('WKLEJ_'));
    }

    function fieldsOf(station) {
        const o = {};
        SYNC_FIELDS.forEach(f => { o[f] = station[f] !== undefined ? station[f] : ''; });
        return o;
    }

    async function init(config, opts) {
        onRemoteChangeCb = (opts && opts.onRemoteChange) || null;

        if (!configLooksValid(config)) {
            console.log('[Sync] Firebase nieskonfigurowany – tryb lokalny (localStorage).');
            enabled = false;
            return { enabled: false };
        }

        try {
            const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
            const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
            const app = appMod.initializeApp(config);
            db = fsMod.getFirestore(app);
            fsApi = fsMod;
            enabled = true;
            console.log('[Sync] Firebase połączony – synchronizacja na żywo AKTYWNA.');

            // Nasłuch zmian zdalnych (inni handlowcy)
            const colRef = fsMod.collection(db, COLLECTION_NAME);
            fsMod.onSnapshot(colRef, (snapshot) => {
                const updates = {};
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'removed') return;
                    const id = change.doc.id;
                    const data = change.doc.data();
                    updates[id] = data;
                    lastSent[id] = JSON.stringify(data); // nie wypychaj z powrotem tego samego
                });
                if (Object.keys(updates).length && onRemoteChangeCb) {
                    applyingRemote = true;
                    try { onRemoteChangeCb(updates); } finally { applyingRemote = false; }
                }
            }, (err) => {
                console.warn('[Sync] Błąd nasłuchu Firestore:', err);
            });

            return { enabled: true };
        } catch (e) {
            console.warn('[Sync] Nie udało się połączyć z Firebase – tryb lokalny.', e);
            enabled = false;
            return { enabled: false };
        }
    }

    // Zainicjuj "lastSent" bieżącym stanem, by nie wypychać całej bazy na starcie
    function seed(stations) {
        (stations || []).forEach(st => {
            const id = String(st.ID_Punktu || '');
            if (id) lastSent[id] = JSON.stringify(fieldsOf(st));
        });
    }

    // Wypchnij zmienione stacje do chmury (debounce)
    function syncFromStations(stations) {
        if (!enabled || applyingRemote) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => pushChanges(stations), 800);
    }

    async function pushChanges(stations) {
        if (!enabled || !db || !fsApi) return;
        const changed = [];
        (stations || []).forEach(st => {
            const id = String(st.ID_Punktu || '');
            if (!id) return;
            const json = JSON.stringify(fieldsOf(st));
            if (lastSent[id] !== json) {
                lastSent[id] = json;
                changed.push({ id, data: fieldsOf(st) });
            }
        });
        if (!changed.length) return;

        try {
            // Zapisy równolegle (merge), pakiety po 400 by nie przeciążać
            for (let i = 0; i < changed.length; i += 400) {
                const slice = changed.slice(i, i + 400);
                await Promise.all(slice.map(c =>
                    fsApi.setDoc(fsApi.doc(db, COLLECTION_NAME, c.id), c.data, { merge: true })
                ));
            }
            console.log(`[Sync] Wysłano ${changed.length} zmian do chmury.`);
        } catch (e) {
            console.warn('[Sync] Błąd zapisu do Firestore:', e);
        }
    }

    return {
        init,
        seed,
        syncFromStations,
        isEnabled: () => enabled
    };
})();
