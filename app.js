/* ==========================================================================
   Logika Biznesowa - System CRM z Mapą dla Handlowców Orlen (SFA)
   Wsparcie dla Leaflet.js, GPS, localStorage, RLS, CSV
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // STAN APLIKACJI (STATE)
    // ==========================================================================
    let stations = [];
    let currentUser = 'rafal.kruk@telforceone.pl';
    let rlsEnabled = false;
    let selectedStation = null;
    let currentTab = 'tab-map';
    let map = null;
    let markers = {}; // Słownik id_punktu -> marker Leaflet
    let userLocationMarker = null; // Marker aktualnej pozycji użytkownika
    let gpsWatchId = null; // ID ciągłego śledzenia GPS urządzenia
    let lastAutoOpenedStationId = null; // Zabezpieczenie przed zapętleniem autodetekcji
    let notifiedStations = new Set();
    let proximityActiveStation = null;
    let markerClusterGroup = null;
    
    // Współrzędne symulacji GPS (Domyślnie Wrocław Rynek)
    let gpsSimLocation = {
        lat: 51.119421,
        lon: 16.992144
    };

    // ==========================================================================
    // BAZA DANYCH FALLBACK (Jeżeli fetch JSON nie działa z powodu CORS / file://)
    // ==========================================================================
    const fallbackStations = [
        {
            "ID_Punktu": "ORL-PL-1001",
            "Nazwa_Stacji": "Orlen nr 4120",
            "Adres": "ul. Legnicka 60, 54-204 Wrocław",
            "Latitude": "51.119421",
            "Longitude": "16.992144",
            "Handlowiec": "jan.kowalski@firma.pl",
            "Status": "Do zrobienia",
            "Ostatnia_Aktualizacja": "",
            "Notatki": "Czeka na rozmowę z kierownikiem o zamówieniu płynu."
        },
        {
            "ID_Punktu": "ORL-PL-1002",
            "Nazwa_Stacji": "Orlen nr 4280",
            "Adres": "ul. Karkonoska 50, 53-015 Wrocław",
            "Latitude": "51.065400",
            "Longitude": "17.001200",
            "Handlowiec": "jan.kowalski@firma.pl",
            "Status": "W trakcie",
            "Ostatnia_Aktualizacja": "2026-07-08 11:15:22",
            "Notatki": "Trwają negocjacje stojaka reklamowego."
        },
        {
            "ID_Punktu": "ORL-PL-1003",
            "Nazwa_Stacji": "Orlen nr 4315",
            "Adres": "ul. Krakowska 350, 50-428 Wrocław",
            "Latitude": "51.087600",
            "Longitude": "17.098700",
            "Handlowiec": "anna.nowak@firma.pl",
            "Status": "Zrobione",
            "Ostatnia_Aktualizacja": "2026-07-08 09:30:10",
            "Notatki": "Wizyta udana. Zamówiono 4 palety płynu zimowego."
        },
        {
            "ID_Punktu": "ORL-PL-1004",
            "Nazwa_Stacji": "Orlen nr 4401",
            "Adres": "ul. Bolesława Krzywoustego 320, 51-318 Wrocław",
            "Latitude": "51.149800",
            "Longitude": "17.112300",
            "Handlowiec": "anna.nowak@firma.pl",
            "Status": "Do zrobienia",
            "Ostatnia_Aktualizacja": "",
            "Notatki": ""
        },
        {
            "ID_Punktu": "ORL-PL-1005",
            "Nazwa_Stacji": "Orlen nr 4512",
            "Adres": "ul. Ślężna 150, 53-111 Wrocław",
            "Latitude": "51.089000",
            "Longitude": "17.028000",
            "Handlowiec": "tomasz.wisniewski@firma.pl",
            "Status": "Do zrobienia",
            "Ostatnia_Aktualizacja": "",
            "Notatki": ""
        },
        {
            "ID_Punktu": "ORL-PL-1006",
            "Nazwa_Stacji": "Orlen nr 3105",
            "Adres": "ul. Puławska 312, 02-819 Warszawa",
            "Latitude": "52.146500",
            "Longitude": "21.031200",
            "Handlowiec": "jan.kowalski@firma.pl",
            "Status": "Do zrobienia",
            "Ostatnia_Aktualizacja": "",
            "Notatki": ""
        },
        {
            "ID_Punktu": "ORL-PL-1007",
            "Nazwa_Stacji": "Orlen nr 3108",
            "Adres": "Aleje Jerozolimskie 144, 02-305 Warszawa",
            "Latitude": "52.219500",
            "Longitude": "20.965400",
            "Handlowiec": "anna.nowak@firma.pl",
            "Status": "Zrobione",
            "Ostatnia_Aktualizacja": "2026-07-07 16:45:00",
            "Notatki": "Uzgodniono ekspozycję nowych napojów energetycznych."
        }
    ];

    // ==========================================================================
    // INICJALIZACJA ELEMENTÓW DOM
    // ==========================================================================
    const userSelect = document.getElementById('current-user-select');
    const rlsToggle = document.getElementById('rls-toggle');
    const urgentOnlyToggle = document.getElementById('urgent-only-toggle');
    const statsCounter = document.getElementById('stats-counter');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const statusFilter = document.getElementById('status-filter');
    const auditFilter = document.getElementById('audit-filter');
    const gpsSimSelect = document.getElementById('gps-sim-select');
    const stationsListContainer = document.getElementById('stations-list');
    const gpsCoordsText = document.getElementById('gps-coords-text');
    
    // Bottom Sheet Elements
    const bottomSheet = document.getElementById('bottom-sheet');
    const sheetCloseBtn = document.getElementById('sheet-close-btn');
    const sheetStationId = document.getElementById('sheet-station-id');
    const sheetStationName = document.getElementById('sheet-station-name');
    const sheetStationAddress = document.getElementById('sheet-station-address');
    const sheetStatusBadge = document.getElementById('sheet-status-badge');
    const sheetAssigneeSelect = document.getElementById('sheet-assignee-select');
    const sheetNotesInput = document.getElementById('sheet-notes-input');
    const sheetUpdateTime = document.getElementById('sheet-update-time');
    const sheetSaveBtn = document.getElementById('sheet-save-btn');
    
    // Szybkie akcje w Bottom Sheet
    const actionTodoBtn = document.getElementById('action-todo-btn');
    const actionProgressBtn = document.getElementById('action-progress-btn');
    const actionDoneBtn = document.getElementById('action-done-btn');
    
    // Tab Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Floating buttons
    const recenterBtn = document.getElementById('recenter-btn');
    
    // Settings Actions
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const importCsvFile = document.getElementById('import-csv-file');
    const resetDbBtn = document.getElementById('reset-db-btn');
    const syncOsmBtn = document.getElementById('sync-osm-btn');
    const googleSheetUrlInput = document.getElementById('google-sheet-url');
    const pullSheetsBtn = document.getElementById('pull-sheets-btn');
    const pushSheetsBtn = document.getElementById('push-sheets-btn');
    const toast = document.getElementById('toast');

    // Overlay element do Bottom Sheet
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    document.getElementById('app-container').appendChild(overlay);

    // ==========================================================================
    // URUCHOMIENIE APLIKACJI (STARTUP)
    // ==========================================================================
    initApp();

    async function initApp() {
        // Poproś o pozwolenie na systemowe powiadomienia GPS
        if (window.Notification && Notification.permission === "default") {
            Notification.requestPermission();
        }
        
        // Inicjalnie spróbuj pobrać i śledzić realną pozycję GPS urządzenia
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    gpsSimLocation.lat = pos.coords.latitude;
                    gpsSimLocation.lon = pos.coords.longitude;
                    const gpsCoordsText = document.getElementById('gps-coords-text');
                    if (gpsCoordsText) {
                        gpsCoordsText.textContent = `Szerokość: ${gpsSimLocation.lat.toFixed(5)}, Długość: ${gpsSimLocation.lon.toFixed(5)} (Real GPS)`;
                    }
                    updateUserLocationMarker();
                    updateStationsListView();
                    if (map) {
                        map.setView([gpsSimLocation.lat, gpsSimLocation.lon], 14);
                    }
                    startRealGpsTracking();
                },
                (err) => {
                    console.warn("Błąd początkowego pobierania GPS:", err);
                    // Domyślnie śledzimy pozycję urządzenia w tle nawet jeśli pierwsze żądanie nie powiodło się
                    startRealGpsTracking();
                }
            );
        }
        
        // 1. Załaduj bazę danych (localStorage lub plik JSON lub fallback)
        await loadDatabase();
        
        // 2. Zainicjalizuj Mapę
        initMap();
        
        // 3. Zainicjalizuj zdarzenia i filtry
        initEvents();
        
        // 4. Załaduj playlistę trasy
        loadCustomRouteList();
        
        // 5. Odśwież widoki i liczniki
        refreshUI();
        
        // 5. Pobierz najświeższe dane z Google Sheets na starcie (cicho)
        const url = localStorage.getItem('google_sheet_webapp_url');
        if (url) {
            console.log("Inicjalna synchronizacja z Google Sheets...");
            setTimeout(() => {
                syncPullFromGoogleSheets(true);
            }, 1500);
        }
        
        // 6. Uruchom auto-synchronizację co 3 minuty w tle (cicho)
        setInterval(() => {
            const urlInLoop = localStorage.getItem('google_sheet_webapp_url');
            if (urlInLoop) {
                console.log("Automatyczne odświeżanie danych z Google Sheets...");
                syncPullFromGoogleSheets(true);
            }
        }, 180000);
    }

    // ==========================================================================
    // OBSŁUGA BAZY DANYCH (localStorage, JSON, Fallback)
    // ==========================================================================
    async function loadDatabase() {
        const localData = localStorage.getItem('orlen_crm_stations');
        
        if (localData) {
            try {
                stations = jsonCleanParse(localData);
                console.log("Dane załadowane z localStorage (ilość:", stations.length, ")");
                
                // Automatyczna migracja adresów e-mail handlowców z @firma.pl do @telforceone.pl
                let migratedEmails = false;
                stations.forEach(st => {
                    if (st.Handlowiec && st.Handlowiec.endsWith('@firma.pl')) {
                        st.Handlowiec = st.Handlowiec.replace('@firma.pl', '@telforceone.pl');
                        migratedEmails = true;
                    }
                });
                if (migratedEmails) {
                    console.log("Zmigrowano lokalne adresy e-mail z @firma.pl do @telforceone.pl");
                    saveToLocalStorage();
                }
                
                // Automatyczna migracja do finalnej bazy 2026 (1966 stacji aktywnych):
                // Jeśli baza w localStorage nie ma dokładnie 1966 stacji lub nie posiada atrybutu Audyt,
                // automatycznie wczytujemy zaktualizowaną bazę stacje_orlen.json.
                const hasAuditField = stations.length > 0 && stations[0].hasOwnProperty('Audyt');
                if (stations.length !== 1966 || !hasAuditField) {
                    console.log("Baza w localStorage wymaga aktualizacji do wersji 2026 (1966 stacji). Ładuję stacje_orlen.json...");
                    const loaded = await loadFromJSON();
                    if (loaded) return;
                } else {
                    return;
                }
            } catch (e) {
                console.error("Błąd parsowania localStorage, ładuję domyślne", e);
            }
        }
        
        await loadFromJSON();
    }

    async function loadFromJSON() {
        try {
            const response = await fetch('stacje_orlen.json');
            if (response.ok) {
                const fetchedData = await response.json();
                if (fetchedData && fetchedData.length > 0) {
                    stations = fetchedData;
                    mockAssignSalespeople(stations);
                    saveToLocalStorage();
                    console.log("Dane pobrane ze stacje_orlen.json (ilość:", stations.length, ")");
                    showToast("Wczytano pełną bazę stacji z pliku JSON");
                    return true;
                }
            }
        } catch (e) {
            console.log("Brak możliwości pobrania JSON (prawdopodobnie file:// lub offline). Ładuję fallback.");
        }
        
        // Ostateczny fallback
        stations = [...fallbackStations];
        saveToLocalStorage();
        console.log("Załadowano wbudowaną bazę fallback (ilość:", stations.length, ")");
        return false;
    }

    function saveToLocalStorage() {
        localStorage.setItem('orlen_crm_stations', JSON.stringify(stations));
    }

    // Pomocnicze przypisanie handlowców do pustej bazy (bezpieczne dla istniejących danych)
    function mockAssignSalespeople(data) {
        data.forEach((st) => {
            // Zgodnie z wytycznymi użytkownika: na start brak przypisanego handlowca (wybiera się go w panelu)
            st.Handlowiec = '';
            st.Status = 'Do zrobienia';
            st.Ostatnia_Aktualizacja = '';
            st.Notatki = '';
        });
    }

    async function syncStationsFromOSM() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        
        if (!loadingOverlay) return;
        
        loadingOverlay.style.display = 'flex';
        loadingText.textContent = "Pobieranie stacji z OSM...";
        
        const query = `[out:json][timeout:90];
area["ISO3166-1"="PL"]->.searchArea;
(
  node["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);
  way["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);
);
out center;`;
        
        const url = "https://overpass-api.de/api/interpreter";
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'data=' + encodeURIComponent(query)
            });
            
            if (!response.ok) {
                throw new Error(`Błąd HTTP Overpass API: ${response.status}`);
            }
            
            const osmData = await response.json();
            const elements = osmData.elements || [];
            
            if (elements.length === 0) {
                throw new Error("Nie odnaleziono stacji w bazie danych OSM.");
            }
            
            const parsedStations = processOSMElementsInJS(elements);
            
            // Mapujemy obecną bazę według ID stacji do szybkiego wyszukiwania
            const currentStationsMap = {};
            stations.forEach(s => {
                currentStationsMap[s.ID_Punktu] = s;
            });
            
            let updatedCount = 0;
            let newCount = 0;
            
            const mergedStations = parsedStations.map(newSt => {
                const existing = currentStationsMap[newSt.ID_Punktu];
                if (existing) {
                    updatedCount++;
                    // Zachowujemy modyfikowalne dane użytkownika (przypisanie, status, notatki)
                    return {
                        ...newSt,
                        Handlowiec: existing.Handlowiec || '',
                        Status: existing.Status || 'Do zrobienia',
                        Ostatnia_Aktualizacja: existing.Ostatnia_Aktualizacja || '',
                        Notatki: existing.Notatki || ''
                    };
                } else {
                    newCount++;
                    return newSt;
                }
            });
            
            stations = mergedStations;
            
            // Przypisanie handlowców do nowych stacji
            mockAssignSalespeople(stations);
            
            saveToLocalStorage();
            refreshUI();
            updateMapMarkers();
            
            showToast(`Zsynchronizowano: zaktualizowano ${updatedCount}, dodano ${newCount} stacji!`);
        } catch (err) {
            console.error("Błąd synchronizacji OSM:", err);
            alert("Błąd podczas synchronizacji z OpenStreetMap:\n" + err.message);
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    function processOSMElementsInJS(elements) {
        const parsed = [];
        elements.forEach(elem => {
            const tags = elem.tags || {};
            let lat = elem.lat;
            let lon = elem.lon;
            
            if (!lat || !lon) {
                const center = elem.center || {};
                lat = center.lat;
                lon = center.lon;
            }
            
            if (!lat || !lon) return;
            
            const osmId = elem.id;
            const stationId = `ORL-PL-${osmId}`;
            
            let name = tags.name || 'Orlen';
            const ref = tags.ref;
            
            if (ref && !name.includes(ref)) {
                name = `Orlen nr ${ref}`;
            } else if (!name.toLowerCase().includes('orlen')) {
                name = `Orlen (${name})`;
            }
            
            const addrStreet = tags['addr:street'] || '';
            const addrHouse = tags['addr:housenumber'] || '';
            const addrPostcode = tags['addr:postcode'] || '';
            const addrCity = tags['addr:city'] || '';
            
            const addressParts = [];
            if (addrStreet) {
                if (addrHouse) {
                    addressParts.push(`ul. ${addrStreet} ${addrHouse}`);
                } else {
                    addressParts.push(`ul. ${addrStreet}`);
                }
            } else if (addrCity) {
                addressParts.push(addrCity);
            }
            
            const cityParts = [];
            if (addrPostcode) cityParts.push(addrPostcode);
            if (addrCity && addrStreet) cityParts.push(addrCity);
            
            if (cityParts.length > 0) {
                addressParts.push(cityParts.join(' '));
            }
            
            let fullAddress = addressParts.join(', ');
            if (!fullAddress) {
                fullAddress = `Stacja Orlen, Polska (współrzędne: ${lat.toFixed(5)}, ${lon.toFixed(5)})`;
            }
            
            parsed.push({
                ID_Punktu: stationId,
                Nazwa_Stacji: name,
                Adres: fullAddress,
                Latitude: String(lat.toFixed(6)),
                Longitude: String(lon.toFixed(6)),
                Handlowiec: '',
                Status: 'Do zrobienia',
                Ostatnia_Aktualizacja: '',
                Notatki: ''
            });
        });
        return parsed;
    }

    // ==========================================================================
    // SYNCHRONIZACJA GOOGLE SHEETS
    // ==========================================================================
    async function syncPullFromGoogleSheets(isSilent = false) {
        const url = localStorage.getItem('google_sheet_webapp_url');
        if (!url) {
            if (!isSilent) alert("Najpierw podaj poprawny URL Aplikacji Google Web App w ustawieniach!");
            return;
        }
        
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        if (!isSilent && loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            loadingText.textContent = "Pobieranie z Google Sheets...";
        }
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("Błąd sieci: " + response.status);
            
            const sheetsData = await response.json();
            if (!sheetsData || sheetsData.length === 0) {
                if (!isSilent) {
                    showToast("Arkusz Google jest pusty. Użyj przycisku 'Wyślij do Google Sheets' aby go zasilić.");
                }
                return;
            }
            
            // Scalamy dane z lokalnymi
            const currentMap = {};
            stations.forEach(s => {
                currentMap[s.ID_Punktu] = s;
            });
            
            let localUpdated = 0;
            let changesFound = false;
            
            sheetsData.forEach(sheetSt => {
                const local = currentMap[sheetSt.ID_Punktu];
                if (local) {
                    // Automatycznie zmigruj @firma.pl na @telforceone.pl
                    const incomingHandlowiec = (sheetSt.Handlowiec || '').replace('@firma.pl', '@telforceone.pl');
                    
                    // Porównujemy czy zaszły zmiany w statusie, notatkach, handlowcu lub czasie aktualizacji
                    if (local.Status !== sheetSt.Status || 
                        local.Notatki !== sheetSt.Notatki || 
                        local.Handlowiec !== incomingHandlowiec ||
                        local.Ostatnia_Aktualizacja !== sheetSt.Ostatnia_Aktualizacja) {
                        
                        local.Status = sheetSt.Status || 'Do zrobienia';
                        local.Notatki = sheetSt.Notatki || '';
                        local.Handlowiec = incomingHandlowiec;
                        local.Ostatnia_Aktualizacja = sheetSt.Ostatnia_Aktualizacja || '';
                        localUpdated++;
                        changesFound = true;
                    }
                }
            });
            
            if (changesFound) {
                saveToLocalStorage();
                updateMapMarkers();
                updateStationsListView();
                updateStats();
                if (isSilent) {
                    showToast(`🔄 Zsynchronizowano ${localUpdated} zmian z arkusza Google Sheets.`);
                }
            }
            
            if (!isSilent) {
                showToast(`Pomyślnie pobrano dane! Zaktualizowano ${localUpdated} stacji.`);
            }
        } catch (err) {
            console.error("Błąd synchronizacji z Google Sheets:", err);
            if (!isSilent) {
                alert("Błąd podczas pobierania danych z Arkusza:\n" + err.message);
            }
        } finally {
            if (!isSilent && loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        }
    }
    
    async function syncPushToGoogleSheets() {
        const url = localStorage.getItem('google_sheet_webapp_url');
        if (!url) {
            return; // Cichy powrót w przypadku autosave na starcie lub braku url
        }
        
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            loadingText.textContent = "Wysyłanie do Google Sheets...";
        }
        
        try {
            // Wysyłamy jako text/plain aby uniknąć CORS preflight (OPTIONS)
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify(stations)
            });
            
            if (!response.ok) throw new Error("Błąd sieci: " + response.status);
            
            const result = await response.json();
            if (result.status === "success") {
                showToast(`Pomyślnie wysłano ${result.count} stacji do Arkusza Google!`);
            } else {
                throw new Error("Serwer zwrócił błąd: " + JSON.stringify(result));
            }
        } catch (err) {
            console.error("Błąd zapisu do Google Sheets:", err);
            // Nie blokujemy użytkownika alertem przy automatycznym zapisie w tle
            showToast("Błąd zapisu do Google Sheets!");
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    }
    
    // ==========================================================================
    // PLANER TRASY I OPTYMALIZACJA TSP (Nearest Neighbor)
    // ==========================================================================
    function planOptimalRoute() {
        const count = parseInt(document.getElementById('route-station-count').value);
        const priority = document.getElementById('route-priority').value;
        
        // Pobierz stacje niezrobione (Status !== 'Zrobione')
        let candidateStations = stations.filter(st => st.Status !== 'Zrobione');
        
        // Filtruj stacje do audytu
        if (priority === 'audit') {
            candidateStations = candidateStations.filter(st => st.Audyt === 'Tak');
        }
        
        if (candidateStations.length === 0) {
            alert("Brak dostępnych stacji do zaplanowania trasy o podanych kryteriach!");
            return;
        }
        
        // Oblicz odległość od pozycji GPS dla wszystkich kandydatów
        candidateStations.forEach(st => {
            st.temp_distance = calculateDistance(
                gpsSimLocation.lat,
                gpsSimLocation.lon,
                parseFloat(st.Latitude),
                parseFloat(st.Longitude)
            );
        });
        
        // Wybierz N najbliższych stacji do pozycji startowej
        candidateStations.sort((a, b) => a.temp_distance - b.temp_distance);
        let selectedForRoute = candidateStations.slice(0, count);
        
        // Optymalizacja trasy TSP algorytmem Najbliższego Sąsiada (Nearest Neighbor)
        let currentLat = gpsSimLocation.lat;
        let currentLon = gpsSimLocation.lon;
        let unvisited = [...selectedForRoute];
        let routeSequence = [];
        let totalDist = 0;
        
        while (unvisited.length > 0) {
            let nearestIdx = 0;
            let nearestDist = Infinity;
            
            for (let i = 0; i < unvisited.length; i++) {
                const st = unvisited[i];
                const dist = calculateDistance(
                    currentLat,
                    currentLon,
                    parseFloat(st.Latitude),
                    parseFloat(st.Longitude)
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIdx = i;
                }
            }
            
            const nextSt = unvisited[nearestIdx];
            totalDist += nearestDist;
            routeSequence.push(nextSt);
            
            currentLat = parseFloat(nextSt.Latitude);
            currentLon = parseFloat(nextSt.Longitude);
            unvisited.splice(nearestIdx, 1);
        }
        
        // Renderuj wyniki
        document.getElementById('route-stops-count').textContent = routeSequence.length;
        document.getElementById('route-total-distance').textContent = `${totalDist.toFixed(1)} km`;
        
        const travelTimeMin = Math.round((totalDist / 40) * 60);
        const visitTimeMin = routeSequence.length * 15;
        document.getElementById('route-est-time').textContent = `${travelTimeMin} min dojazdu (+ ${visitTimeMin} min wizyty)`;
        
        const listEl = document.getElementById('route-stops-list');
        listEl.innerHTML = '';
        routeSequence.forEach((st) => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${st.Nazwa_Stacji}</strong> - ${st.Adres.split(',')[0]} (ok. ${st.temp_distance.toFixed(1)} km stąd)`;
            listEl.appendChild(li);
        });
        
        document.getElementById('route-results').style.display = 'block';
        showToast("Trasa została pomyślnie zoptymalizowana!");
        
        window.lastPlannedRoute = routeSequence;
    }
    
    function openPlannedRouteInGoogleMaps() {
        if (!window.lastPlannedRoute || window.lastPlannedRoute.length === 0) {
            alert("Najpierw zaplanuj trasę!");
            return;
        }
        
        const start = `${gpsSimLocation.lat},${gpsSimLocation.lon}`;
        const destSt = window.lastPlannedRoute[window.lastPlannedRoute.length - 1];
        const dest = `${destSt.Latitude},${destSt.Longitude}`;
        
        let waypoints = [];
        if (window.lastPlannedRoute.length > 1) {
            const intermediate = window.lastPlannedRoute.slice(0, -1);
            waypoints = intermediate.map(st => `${st.Latitude},${st.Longitude}`);
        }
        
        let gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest)}`;
        
        if (waypoints.length > 0) {
            gmapsUrl += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
        }
        
        window.open(gmapsUrl, '_blank');
    }

    // ==========================================================================
    // LOGIKA PLAYLISTY TRASY (KOSZYK STACJI NA DZIŚ)
    // ==========================================================================
    let customRouteList = [];

    function loadCustomRouteList() {
        const data = localStorage.getItem('orlen_custom_route');
        if (data) {
            try {
                customRouteList = JSON.parse(data);
            } catch(e) {
                customRouteList = [];
            }
        }
        updateCustomRouteUI();
    }

    function saveCustomRouteList() {
        localStorage.setItem('orlen_custom_route', JSON.stringify(customRouteList));
        updateCustomRouteUI();
    }

    function toggleCustomRoute(station) {
        const idx = customRouteList.findIndex(s => s.ID_Punktu === station.ID_Punktu);
        if (idx !== -1) {
            customRouteList.splice(idx, 1);
            showToast("Usunięto stację z trasy");
        } else {
            customRouteList.push(station);
            showToast("Dodano stację do dzisiejszej trasy");
        }
        saveCustomRouteList();
    }

    function removeFromCustomRoute(stationId) {
        customRouteList = customRouteList.filter(s => s.ID_Punktu !== stationId);
        saveCustomRouteList();
        showToast("Usunięto stację z trasy");
    }

    function updateCustomRouteUI() {
        const listEl = document.getElementById('route-custom-list');
        const emptyEl = document.getElementById('route-custom-empty');
        const countEl = document.getElementById('route-custom-count');
        
        if (!listEl) return;
        
        if (customRouteList.length === 0) {
            listEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'block';
            if (countEl) countEl.textContent = '0 stacji';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            listEl.style.display = 'block';
            listEl.innerHTML = '';
            
            customRouteList.forEach(st => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong>${st.Nazwa_Stacji}</strong>
                        <span style="font-size: 0.7rem; color: var(--dark-muted);">${st.Adres.split(',')[0]}</span>
                    </div>
                    <button class="remove-btn" data-id="${st.ID_Punktu}"><i class="fa-solid fa-trash-can"></i></button>
                `;
                li.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromCustomRoute(st.ID_Punktu);
                });
                listEl.appendChild(li);
            });
            if (countEl) countEl.textContent = `${customRouteList.length} stacji`;
        }
        
        updateBottomSheetRouteButton();
    }

    function updateBottomSheetRouteButton() {
        const toggleBtn = document.getElementById('sheet-toggle-route-btn');
        if (!toggleBtn || !selectedStation) return;
        
        const isAdded = customRouteList.some(s => s.ID_Punktu === selectedStation.ID_Punktu);
        if (isAdded) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-circle-minus"></i> Usuń z dzisiejszej trasy';
            toggleBtn.style.backgroundColor = '#FFA1A1';
            toggleBtn.style.borderColor = '#FFA1A1';
            toggleBtn.style.color = '#1E293B';
        } else {
            toggleBtn.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Dodaj do dzisiejszej trasy';
            toggleBtn.style.backgroundColor = '';
            toggleBtn.style.borderColor = '';
            toggleBtn.style.color = '';
        }
    }

    function planCustomRoute() {
        if (customRouteList.length === 0) {
            alert("Dodaj najpierw stacje do trasy!");
            return;
        }
        
        const optMode = document.getElementById('route-custom-optimization').value;
        let routeSequence = [];
        
        if (optMode === 'tsp') {
            let currentLat = gpsSimLocation.lat;
            let currentLon = gpsSimLocation.lon;
            let unvisited = [...customRouteList];
            
            while (unvisited.length > 0) {
                let nearestIdx = 0;
                let nearestDist = Infinity;
                
                for (let i = 0; i < unvisited.length; i++) {
                    const st = unvisited[i];
                    const dist = calculateDistance(currentLat, currentLon, parseFloat(st.Latitude), parseFloat(st.Longitude));
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestIdx = i;
                    }
                }
                
                const nextSt = unvisited[nearestIdx];
                routeSequence.push({ ...nextSt, temp_dist: nearestDist });
                
                currentLat = parseFloat(nextSt.Latitude);
                currentLon = parseFloat(nextSt.Longitude);
                unvisited.splice(nearestIdx, 1);
            }
        } else {
            let currentLat = gpsSimLocation.lat;
            let currentLon = gpsSimLocation.lon;
            routeSequence = customRouteList.map(st => {
                const dist = calculateDistance(currentLat, currentLon, parseFloat(st.Latitude), parseFloat(st.Longitude));
                currentLat = parseFloat(st.Latitude);
                currentLon = parseFloat(st.Longitude);
                return { ...st, temp_dist: dist };
            });
        }
        
        let totalDist = 0;
        routeSequence.forEach(item => { totalDist += item.temp_dist; });
        
        document.getElementById('route-custom-stops-count').textContent = routeSequence.length;
        document.getElementById('route-custom-total-distance').textContent = `${totalDist.toFixed(1)} km`;
        
        const travelTimeMin = Math.round((totalDist / 40) * 60);
        const visitTimeMin = routeSequence.length * 15;
        document.getElementById('route-custom-est-time').textContent = `${travelTimeMin} min dojazdu (+ ${visitTimeMin} min wizyty)`;
        
        const stopsListEl = document.getElementById('route-custom-stops-list');
        stopsListEl.innerHTML = '';
        routeSequence.forEach((st) => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${st.Nazwa_Stacji}</strong> - ${st.Adres.split(',')[0]} (ok. ${st.temp_dist.toFixed(1)} km)`;
            stopsListEl.appendChild(li);
        });
        
        document.getElementById('route-custom-results').style.display = 'block';
        showToast("Trasa została pomyślnie wyznaczona!");
        
        window.lastPlannedCustomRoute = routeSequence;
    }

    function openCustomRouteInGoogleMaps() {
        const route = window.lastPlannedCustomRoute || customRouteList;
        if (route.length === 0) {
            alert("Dodaj najpierw stacje do trasy!");
            return;
        }
        
        const start = `${gpsSimLocation.lat},${gpsSimLocation.lon}`;
        const destSt = route[route.length - 1];
        const dest = `${destSt.Latitude},${destSt.Longitude}`;
        
        let waypoints = [];
        if (route.length > 1) {
            const intermediate = route.slice(0, -1);
            waypoints = intermediate.map(st => `${st.Latitude},${st.Longitude}`);
        }
        
        let gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest)}`;
        
        if (waypoints.length > 0) {
            gmapsUrl += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
        }
        
        window.open(gmapsUrl, '_blank');
    }

    function generateAutoRouteInTab() {
        const count = parseInt(document.getElementById('route-auto-count').value);
        const priority = document.getElementById('route-auto-priority').value;
        
        let candidateStations = stations.filter(st => st.Status !== 'Zrobione');
        if (priority === 'audit') {
            candidateStations = candidateStations.filter(st => st.Audyt === 'Tak');
        }
        
        if (candidateStations.length === 0) {
            alert("Brak stacji spełniających te kryteria!");
            return;
        }
        
        candidateStations.forEach(st => {
            st.temp_dist = calculateDistance(gpsSimLocation.lat, gpsSimLocation.lon, parseFloat(st.Latitude), parseFloat(st.Longitude));
        });
        
        candidateStations.sort((a, b) => a.temp_dist - b.temp_dist);
        const selected = candidateStations.slice(0, count);
        
        customRouteList = [...selected];
        saveCustomRouteList();
        
        planCustomRoute();
        showToast(`Wygenerowano trasę z ${selected.length} stacji.`);
    }

    function startRealGpsTracking() {
        if (gpsWatchId) {
            navigator.geolocation.clearWatch(gpsWatchId);
        }
        
        if (navigator.geolocation) {
            gpsWatchId = navigator.geolocation.watchPosition(
                (pos) => {
                    gpsSimLocation.lat = pos.coords.latitude;
                    gpsSimLocation.lon = pos.coords.longitude;
                    const gpsCoordsText = document.getElementById('gps-coords-text');
                    if (gpsCoordsText) {
                        gpsCoordsText.textContent = `Szerokość: ${gpsSimLocation.lat.toFixed(5)}, Długość: ${gpsSimLocation.lon.toFixed(5)} (Real GPS)`;
                    }
                    updateUserLocationMarker();
                    updateStationsListView();
                    checkGeofencing(gpsSimLocation.lat, gpsSimLocation.lon);
                },
                (error) => {
                    console.warn("Błąd śledzenia GPS:", error);
                },
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
            );
        }
    }

    // Bezpieczne parsowanie JSON
    function jsonCleanParse(str) {
        return JSON.parse(str);
    }

    // ==========================================================================
    // INICJALIZACJA MAPY LEAFLET
    // ==========================================================================
    function initMap() {
        // Tworzymy mapę w wybranym punkcie początkowym (gpsSimLocation)
        map = L.map('map', {
            zoomControl: false // Wyłączamy domyślne przyciski +/- z lewej góry (dodamy własne lub zostawimy gesty)
        }).setView([gpsSimLocation.lat, gpsSimLocation.lon], 13);
        
        // Dodanie warstwy mapy OpenStreetMap (darmowe kafelki)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        // Dodanie przycisków zoom w prawym górnym rogu dla wygody
        L.control.zoom({
            position: 'topright'
        }).addTo(map);
        
        // Inicjalizacja grupy klastrów markerów
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });
        map.addLayer(markerClusterGroup);
        
        // Dodanie markera pozycji użytkownika (GPS)
        updateUserLocationMarker();
        
        // Wygenerowanie markerów stacji
        updateMapMarkers();
    }

    // Aktualizacja markera pozycji użytkownika na mapie
    function updateUserLocationMarker() {
        if (!map) return;
        
        const gpsIcon = L.divIcon({
            className: 'gps-user-marker',
            html: `<div class="gps-pulse"></div><div class="gps-dot"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Styl dla pulsującego kółka GPS użytkownika
        if (!document.getElementById('gps-style-tag')) {
            const style = document.createElement('style');
            style.id = 'gps-style-tag';
            style.innerHTML = `
                .gps-user-marker {
                    position: relative;
                    width: 20px;
                    height: 20px;
                }
                .gps-dot {
                    width: 12px;
                    height: 12px;
                    background-color: #3B82F6;
                    border: 2px solid white;
                    border-radius: 50%;
                    position: absolute;
                    top: 4px;
                    left: 4px;
                    box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
                    z-index: 10;
                }
                .gps-pulse {
                    width: 20px;
                    height: 20px;
                    background-color: rgba(59, 130, 246, 0.4);
                    border-radius: 50%;
                    position: absolute;
                    top: 0;
                    left: 0;
                    animation: pulse-gps 1.8s infinite ease-out;
                }
                @keyframes pulse-gps {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(2.2); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        if (userLocationMarker) {
            userLocationMarker.setLatLng([gpsSimLocation.lat, gpsSimLocation.lon]);
        } else {
            userLocationMarker = L.marker([gpsSimLocation.lat, gpsSimLocation.lon], { icon: gpsIcon }).addTo(map);
        }
    }

    // Tworzenie/aktualizacja markerów na mapie (z użyciem klastrowania)
    function updateMapMarkers() {
        if (!map || !markerClusterGroup) return;
        
        // Usunięcie starych markerów z grupy klastrów
        markerClusterGroup.clearLayers();
        markers = {};
        
        // Filtrowanie stacji
        const visibleStations = getFilteredStations();
        
        visibleStations.forEach(st => {
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            
            if (isNaN(lat) || isNaN(lon)) return;
            
            // Stylizacja pinu w zależności od statusu
            let statusClass = 'pin-todo';
            if (st.Status === 'W trakcie') statusClass = 'pin-progress';
            else if (st.Status === 'Zrobione') statusClass = 'pin-done';
            
            // Jeśli stacja wymaga pilnego audytu i nie jest jeszcze zrobiona, oznacz ją jako "urgent"
            let urgentClass = '';
            if (st.Audyt === 'Tak' && st.Status !== 'Zrobione') {
                urgentClass = 'pin-urgent';
            }
            
            const innerHtml = st.Audyt === 'Tak' ? '<span class="audit-exclamation">!</span>' : '';
            const customIcon = L.divIcon({
                className: 'custom-leaflet-icon',
                html: `
                    <div class="custom-pin ${statusClass} ${urgentClass}">
                        <div class="pin-shadow"></div>
                        <div class="pin-body">
                            <div class="pin-inner">${innerHtml}</div>
                        </div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 32], // Stopka pinu dotyka punktu na mapie
                popupAnchor: [0, -32]
            });
            
            const marker = L.marker([lat, lon], { icon: customIcon });
            
            // Kliknięcie w marker otwiera Bottom Sheet
            marker.on('click', () => {
                openStationDetails(st);
            });
            
            markerClusterGroup.addLayer(marker);
            markers[st.ID_Punktu] = marker;
        });
    }

    // ==========================================================================
    // REGUŁY FILTROWANIA I POZYSKIWANIA DANYCH (RLS + Wyszukiwarka)
    // ==========================================================================
    function getFilteredStations() {
        return stations.filter(st => {
            // Filtrowanie niepoprawnych współrzędnych GPS
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) {
                return false;
            }

            // 1. Filtrowanie "Tylko moje stacje" - stacje dodane do dzisiejszej trasy
            if (rlsEnabled) {
                const isInRouteList = customRouteList.some(r => r.ID_Punktu === st.ID_Punktu);
                if (!isInRouteList) {
                    return false;
                }
            }
            
            // Filtrowanie priorytetu / audytu (dostępne zawsze dla mapy i listy)
            if (auditFilter && auditFilter.value === 'audit' && st.Audyt !== 'Tak') {
                return false;
            }

            // Globalny przełącznik "tylko pilne stacje"
            if (urgentOnlyToggle && urgentOnlyToggle.checked && st.Audyt !== 'Tak') {
                return false;
            }
            
            // 2. Filtrowanie statusu (w zakładce lista)
            if (currentTab === 'tab-list') {
                const statusVal = statusFilter.value;
                if (statusVal !== 'all' && st.Status !== statusVal) {
                    return false;
                }
                
                // 3. Wyszukiwarka tekstowa
                const searchVal = searchInput.value.toLowerCase().trim();
                if (searchVal) {
                    const matchesSearch = 
                        st.Nazwa_Stacji.toLowerCase().includes(searchVal) ||
                        st.Adres.toLowerCase().includes(searchVal) ||
                        st.ID_Punktu.toLowerCase().includes(searchVal);
                    
                    if (!matchesSearch) {
                        return false;
                    }
                }
            }
            
            return true;
        });
    }

    // ==========================================================================
    // DOLNY PANEL SZCZEGÓŁÓW (BOTTOM SHEET)
    // ==========================================================================
    function openStationDetails(station, isAutoDetected = false) {
        selectedStation = station;
        
        // Pokazywanie/ukrywanie alertu GPS geofencingu
        const geofenceAlert = document.getElementById('sheet-geofence-alert');
        if (geofenceAlert) {
            geofenceAlert.style.display = isAutoDetected ? 'flex' : 'none';
        }
        
        // Wypełnienie formularza danymi
        sheetStationId.textContent = station.ID_Punktu;
        sheetStationName.textContent = station.Nazwa_Stacji;
        sheetStationAddress.textContent = station.Adres;
        
        sheetStatusBadge.textContent = station.Status;
        sheetStatusBadge.setAttribute('data-status', station.Status);
        
        sheetAssigneeSelect.value = station.Handlowiec || "";
        sheetNotesInput.value = station.Notatki || "";
        sheetUpdateTime.textContent = station.Ostatnia_Aktualizacja || "Brak";
        
        // Zaznaczenie odpowiedniego przycisku szybkiej akcji
        updateQuickActionButtonsActive(station.Status);
        
        // Uaktualnienie wyglądu przycisku dodawania do trasy
        updateBottomSheetRouteButton();
        
        // Otwórz Bottom Sheet i Overlay
        bottomSheet.classList.add('open');
        overlay.classList.add('show');
    }

    function closeStationDetails() {
        bottomSheet.classList.remove('open');
        overlay.classList.remove('show');
        selectedStation = null;
        
        const geofenceAlert = document.getElementById('sheet-geofence-alert');
        if (geofenceAlert) {
            geofenceAlert.style.display = 'none';
        }
    }

    function updateQuickActionButtonsActive(status) {
        actionTodoBtn.classList.remove('active');
        actionProgressBtn.classList.remove('active');
        actionDoneBtn.classList.remove('active');
        
        if (status === 'Do zrobienia') actionTodoBtn.classList.add('active');
        else if (status === 'W trakcie') actionProgressBtn.classList.add('active');
        else if (status === 'Zrobione') actionDoneBtn.classList.add('active');
    }

    // Szybkie kliknięcie zmiany statusu
    function updateSelectedStationStatus(status) {
        if (!selectedStation) return;
        
        selectedStation.Status = status;
        selectedStation.Ostatnia_Aktualizacja = getFormattedDate();
        
        // Zaktualizuj widok panelu
        sheetStatusBadge.textContent = status;
        sheetStatusBadge.setAttribute('data-status', status);
        sheetUpdateTime.textContent = selectedStation.Ostatnia_Aktualizacja;
        
        updateQuickActionButtonsActive(status);
    }

    function saveStationChanges() {
        if (!selectedStation) return;
        
        // Pobierz dane z formularza
        selectedStation.Handlowiec = sheetAssigneeSelect.value;
        selectedStation.Notatki = sheetNotesInput.value;
        
        // Zapisz do bazy lokalnej
        saveToLocalStorage();
        
        // Odśwież mapę i listę
        updateMapMarkers();
        updateStationsListView();
        updateStats();
        
        // Zamknij arkusz i pokaż powiadomienie
        closeStationDetails();
        showToast("Zapisano zmiany pomyślnie!");
        
        // Automatyczny zapis do Google Sheets, jeśli URL jest podany
        const sheetUrl = localStorage.getItem('google_sheet_webapp_url');
        if (sheetUrl) {
            console.log("Automatyczna aktualizacja Google Sheets w tle...");
            syncPushToGoogleSheets();
        }
    }

    // ==========================================================================
    // LISTA STACJI (ZAKŁADKA LISTA)
    // ==========================================================================
    function updateStationsListView() {
        const filtered = getFilteredStations();
        
        if (filtered.length === 0) {
            stationsListContainer.innerHTML = `
                <div class="list-placeholder">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    Brak stacji spełniających kryteria wyszukiwania.
                </div>
            `;
            return;
        }
        
        // Obliczenie odległości dla każdej stacji od pozycji GPS
        filtered.forEach(st => {
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            st.distance = calculateDistance(gpsSimLocation.lat, gpsSimLocation.lon, lat, lon);
        });
        
        // Sortowanie po odległości (rosnąco)
        filtered.sort((a, b) => a.distance - b.distance);
        
        // Generowanie HTML
        stationsListContainer.innerHTML = '';
        filtered.forEach(st => {
            const card = document.createElement('div');
            card.className = 'station-card';
            
            // Formatowanie dystansu
            let distStr = '';
            if (st.distance < 1) {
                distStr = `${Math.round(st.distance * 1000)} m`;
            } else {
                distStr = `${st.distance.toFixed(1)} km`;
            }
            
            let statusClass = 'todo';
            if (st.Status === 'W trakcie') statusClass = 'progress';
            else if (st.Status === 'Zrobione') statusClass = 'done';
            
            const auditBadgeHtml = st.Audyt === 'Tak' ? '<span class="audit-badge"><i class="fa-solid fa-triangle-exclamation"></i> PILNE</span>' : '';
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title-group">
                        <span class="station-id-label">${st.ID_Punktu}</span>
                        ${auditBadgeHtml}
                        <h4>${st.Nazwa_Stacji}</h4>
                    </div>
                    <div class="card-status-dot ${statusClass}" title="${st.Status}"></div>
                </div>
                <div class="card-address">${st.Adres}</div>
                <div class="card-footer">
                    <span class="card-distance"><i class="fa-solid fa-location-arrow"></i> ${distStr}</span>
                    <span class="card-assignee">
                        <i class="fa-solid fa-user-tie"></i> 
                        ${st.Handlowiec ? st.Handlowiec.split('@')[0] : '<em>Nieprzypisany</em>'}
                    </span>
                </div>
            `;
            
            // Kliknięcie w kartę na liście:
            // 1. Zmień tab na mapę
            // 2. Wyśrodkuj mapę na tej stacji
            // 3. Otwórz panel stacji
            card.addEventListener('click', () => {
                switchToTab('tab-map');
                const lat = parseFloat(st.Latitude);
                const lon = parseFloat(st.Longitude);
                if (map && !isNaN(lat) && !isNaN(lon)) {
                    map.setView([lat, lon], 15);
                }
                setTimeout(() => {
                    openStationDetails(st);
                }, 300);
            });
            
            stationsListContainer.appendChild(card);
        });
    }

    // Statystyki postępu zrobionych stacji
    function updateStats() {
        const done = stations.filter(st => st.Status === 'Zrobione').length;
        
        // Zaktualizuj nagłówek
        document.querySelector('.done-count').textContent = done;
        document.querySelector('.total-count').textContent = stations.length;
    }

    // ==========================================================================
    // INTEGRACJA CSV (IMPORT / EKSPORT)
    // ==========================================================================
    
    // Eksport do pliku CSV
    function exportToCSV() {
        let csvContent = "\ufeff"; // BOM dla MS Excel, aby poprawnie odczytywał polskie znaki UTF-8
        
        // Nagłówki zgodne z wytycznymi w PDF
        const headers = ['ID_Punktu', 'Nazwa_Stacji', 'Adres', 'Latitude', 'Longitude', 'Handlowiec', 'Status', 'Ostatnia_Aktualizacja', 'Notatki'];
        csvContent += headers.map(h => `"${h}"`).join(",") + "\n";
        
        stations.forEach(st => {
            const row = [
                st.ID_Punktu,
                st.Nazwa_Stacji,
                st.Adres,
                st.Latitude,
                st.Longitude,
                st.Handlowiec,
                st.Status,
                st.Ostatnia_Aktualizacja,
                st.Notatki
            ];
            // Eskapowanie cudzysłowów w polach tekstowych
            const formattedRow = row.map(val => {
                if (val === undefined || val === null) return '""';
                let cleanVal = String(val).replace(/"/g, '""');
                return `"${cleanVal}"`;
            });
            csvContent += formattedRow.join(",") + "\n";
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "stacje_orlen_crm.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Wyeksportowano bazę do pliku CSV");
    }

    // Import z pliku CSV
    function handleCSVImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            try {
                const parsedStations = parseCSV(text);
                if (parsedStations && parsedStations.length > 0) {
                    stations = parsedStations;
                    saveToLocalStorage();
                    
                    // Odświeżamy całą aplikację
                    updateMapMarkers();
                    updateStationsListView();
                    updateStats();
                    
                    // Jeśli mamy mapę, wyśrodkujmy na pierwszą zaimportowaną stację
                    if (map && stations.length > 0) {
                        const first = stations[0];
                        const lat = parseFloat(first.Latitude);
                        const lon = parseFloat(first.Longitude);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            map.setView([lat, lon], 11);
                        }
                    }
                    
                    showToast(`Pomyślnie zaimportowano ${stations.length} stacji!`);
                    switchToTab('tab-map');
                } else {
                    alert("Plik CSV jest pusty lub ma nieprawidłowy format!");
                }
            } catch (err) {
                console.error(err);
                alert("Błąd podczas przetwarzania pliku CSV. Upewnij się, że struktura kolumn jest zgodna z projektem.");
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    // Prosty parser CSV obsługujący cudzysłowy i przecinki wewnątrz pól
    function parseCSV(text) {
        // Usuwanie znaku BOM (\ufeff), jeśli istnieje na początku pliku
        if (text.startsWith('\ufeff')) {
            text = text.slice(1);
        }
        const lines = [];
        let row = [""];
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i+1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') { // Eskapowany cudzysłów ""
                    row[row.length - 1] += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes; // Przełącznik stanu cudzysłowu
                }
            } else if (char === ',' && !inQuotes) {
                row.push('');
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                lines.push(row);
                row = [''];
            } else {
                row[row.length - 1] += char;
            }
        }
        if (row.length > 1 || row[0] !== '') {
            lines.push(row);
        }
        
        if (lines.length < 2) return [];
        
        const headers = lines[0].map(h => h.trim().replace(/^"|"$/g, ''));
        const result = [];
        
        // Indeksy kluczowych kolumn
        const idIdx = headers.indexOf('ID_Punktu');
        const nameIdx = headers.indexOf('Nazwa_Stacji');
        const addrIdx = headers.indexOf('Adres');
        const latIdx = headers.indexOf('Latitude');
        const lonIdx = headers.indexOf('Longitude');
        const empIdx = headers.indexOf('Handlowiec');
        const statIdx = headers.indexOf('Status');
        const timeIdx = headers.indexOf('Ostatnia_Aktualizacja');
        const noteIdx = headers.indexOf('Notatki');
        
        if (idIdx === -1 || latIdx === -1 || lonIdx === -1) {
            throw new Error("Brak wymaganych nagłówków kolumn: ID_Punktu, Latitude, Longitude");
        }
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.length < headers.length) continue; // Pusta lub niekompletna linia
            
            result.push({
                ID_Punktu: line[idIdx],
                Nazwa_Stacji: nameIdx !== -1 ? line[nameIdx] : 'Orlen',
                Adres: addrIdx !== -1 ? line[addrIdx] : '',
                Latitude: line[latIdx],
                Longitude: line[lonIdx],
                Handlowiec: empIdx !== -1 ? (line[empIdx] || '').replace('@firma.pl', '@telforceone.pl') : '',
                Status: statIdx !== -1 && line[statIdx] ? line[statIdx] : 'Do zrobienia',
                Ostatnia_Aktualizacja: timeIdx !== -1 ? line[timeIdx] : '',
                Notatki: noteIdx !== -1 ? line[noteIdx] : ''
            });
        }
        
        return result;
    }

    // ==========================================================================
    // OBSŁUGA ZDARZEŃ I INTERFEJSU (EVENTS)
    // ==========================================================================
    function initEvents() {
        // Inicjalizacja baneru powiadomienia GPS
        const proximityBanner = document.getElementById('proximity-alert-banner');
        const proximityText = document.getElementById('proximity-alert-text');
        const proximityBtnYes = document.getElementById('proximity-btn-yes');
        const proximityBtnNo = document.getElementById('proximity-btn-no');
        
        if (proximityBtnYes) {
            proximityBtnYes.addEventListener('click', () => {
                if (proximityActiveStation) {
                    switchToTab('tab-map');
                    const lat = parseFloat(proximityActiveStation.Latitude);
                    const lon = parseFloat(proximityActiveStation.Longitude);
                    if (map && !isNaN(lat) && !isNaN(lon)) {
                        map.setView([lat, lon], 16);
                    }
                    openStationDetails(proximityActiveStation);
                    updateSelectedStationStatus('W trakcie');
                    setTimeout(() => {
                        if (sheetNotesInput) sheetNotesInput.focus();
                    }, 400);
                }
                if (proximityBanner) proximityBanner.style.display = 'none';
            });
        }
        
        if (proximityBtnNo) {
            proximityBtnNo.addEventListener('click', () => {
                if (proximityBanner) proximityBanner.style.display = 'none';
            });
        }

        // Wczytanie adresu URL Google Sheets z localStorage na start
        if (googleSheetUrlInput) {
            googleSheetUrlInput.value = localStorage.getItem('google_sheet_webapp_url') || '';
            googleSheetUrlInput.addEventListener('change', (e) => {
                localStorage.setItem('google_sheet_webapp_url', e.target.value.trim());
                showToast("Zapisano adres URL Arkusza Google");
            });
        }
        
        if (pullSheetsBtn) {
            pullSheetsBtn.addEventListener('click', syncPullFromGoogleSheets);
        }
        
        if (pushSheetsBtn) {
            pushSheetsBtn.addEventListener('click', () => {
                const url = localStorage.getItem('google_sheet_webapp_url');
                if (!url) {
                    alert("Najpierw podaj poprawny URL Aplikacji Google Web App w ustawieniach!");
                    return;
                }
                syncPushToGoogleSheets();
            });
        }
        
        // Zmiana zalogowanego handlowca
        if (userSelect) {
            userSelect.addEventListener('change', (e) => {
                currentUser = e.target.value;
                updateMapMarkers();
                updateStationsListView();
                updateStats();
                showToast(`Przełączono na użytkownika: ${currentUser.split('@')[0]}`);
            });
        }
        
        // Włączenie/wyłączenie filtrowania RLS
        rlsToggle.addEventListener('change', (e) => {
            rlsEnabled = e.target.checked;
            updateMapMarkers();
            updateStationsListView();
            updateStats();
        });
        
        // Tab switching
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.getAttribute('data-tab');
                switchToTab(targetTab);
            });
        });
        
        // Wyszukiwarka i filtry
        searchInput.addEventListener('input', () => {
            if (searchInput.value.trim().length > 0) {
                clearSearchBtn.style.display = 'block';
            } else {
                clearSearchBtn.style.display = 'none';
            }
            updateStationsListView();
        });
        
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            updateStationsListView();
        });
        
        statusFilter.addEventListener('change', () => {
            updateStationsListView();
        });
        
        if (auditFilter) {
            auditFilter.addEventListener('change', () => {
                updateMapMarkers();
                updateStationsListView();
            });
        }
        
        // Wybór lokalizacji GPS (tylko real GPS)
        gpsSimSelect.addEventListener('change', (e) => {
            handleGpsLocationChange(e.target.value);
        });

        if (urgentOnlyToggle) {
            urgentOnlyToggle.addEventListener('change', () => {
                updateMapMarkers();
                updateStationsListView();
            });
        }
        
        const mapRoutePlannerBtn = document.getElementById('map-route-planner-btn');
        if (mapRoutePlannerBtn) {
            mapRoutePlannerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                switchToTab('tab-route');
            });
        }
        
        // Dodaj do trasy w Bottom Sheet
        const sheetToggleRouteBtn = document.getElementById('sheet-toggle-route-btn');
        if (sheetToggleRouteBtn) {
            sheetToggleRouteBtn.addEventListener('click', () => {
                if (selectedStation) {
                    toggleCustomRoute(selectedStation);
                }
            });
        }
        
        // Przyciski w zakładce Trasa
        const routeCustomClearBtn = document.getElementById('route-custom-clear-btn');
        const routeCustomPlanBtn = document.getElementById('route-custom-plan-btn');
        const routeCustomOpenGmapsBtn = document.getElementById('route-custom-open-gmaps-btn');
        const routeAutoPlanBtn = document.getElementById('route-auto-plan-btn');
        
        if (routeCustomClearBtn) {
            routeCustomClearBtn.addEventListener('click', () => {
                if (confirm("Czy na pewno chcesz wyczyścić listę stacji na dziś?")) {
                    customRouteList = [];
                    saveCustomRouteList();
                    document.getElementById('route-custom-results').style.display = 'none';
                }
            });
        }
        
        if (routeCustomPlanBtn) {
            routeCustomPlanBtn.addEventListener('click', planCustomRoute);
        }
        
        if (routeCustomOpenGmapsBtn) {
            routeCustomOpenGmapsBtn.addEventListener('click', openCustomRouteInGoogleMaps);
        }
        
        if (routeAutoPlanBtn) {
            routeAutoPlanBtn.addEventListener('click', generateAutoRouteInTab);
        }
        
        // Wyśrodkowanie na pozycję GPS użytkownika
        recenterBtn.addEventListener('click', () => {
            if (map) {
                map.setView([gpsSimLocation.lat, gpsSimLocation.lon], 14);
                showToast("Wyśrodkowano na pozycji GPS");
            }
        });
        
        // Zamknięcie bottom sheet (kliknięcie w X lub overlay)
        sheetCloseBtn.addEventListener('click', closeStationDetails);
        overlay.addEventListener('click', closeStationDetails);
        
        // Szybkie akcje statusów
        actionTodoBtn.addEventListener('click', () => updateSelectedStationStatus('Do zrobienia'));
        actionProgressBtn.addEventListener('click', () => updateSelectedStationStatus('W trakcie'));
        actionDoneBtn.addEventListener('click', () => updateSelectedStationStatus('Zrobione'));
        
        // Zapisanie zmian w arkuszu
        sheetSaveBtn.addEventListener('click', saveStationChanges);
        
        // Eksport i import CSV
        exportCsvBtn.addEventListener('click', exportToCSV);
        importCsvFile.addEventListener('change', handleCSVImport);
        
        // Synchronizacja z OSM
        if (syncOsmBtn) {
            syncOsmBtn.addEventListener('click', syncStationsFromOSM);
        }
        
        // Reset bazy
        resetDbBtn.addEventListener('click', () => {
            if (confirm("Czy na pewno chcesz zresetować bazę danych do ustawień domyślnych? Stracisz wszystkie zapisane statusy i notatki.")) {
                localStorage.removeItem('orlen_crm_stations');
                initApp();
                showToast("Baza danych została zresetowana!");
            }
        });
    }

    // Przełączanie paneli i nawigacji dolnej
    function switchToTab(tabId) {
        currentTab = tabId;
        
        // Nawigacja aktywna klasa
        navItems.forEach(nav => {
            nav.classList.remove('active');
            if (nav.getAttribute('data-tab') === tabId) {
                nav.classList.add('active');
            }
        });
        
        // Aktywny panel
        tabPanels.forEach(panel => {
            panel.classList.remove('active');
            if (panel.id === tabId) {
                panel.classList.add('active');
            }
        });
        
        // Naprawa Leafleta przy powrocie na zakładkę mapa
        if (tabId === 'tab-map' && map) {
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }
        
        // Generowanie listy stacji jeśli przeszliśmy do zakładki lista
        if (tabId === 'tab-list') {
            updateStationsListView();
        }
    }

    let lastGeofenceOpenedId = null;

    // Automatyczne wykrywanie obecności na stacji (geofencing) oraz powiadomienia o bliskości (proximity)
    function checkGeofencing(lat, lon) {
        if (stations.length === 0) return;
        
        let closestStation = null;
        let minDistance = Infinity;
        
        stations.forEach(st => {
            const stLat = parseFloat(st.Latitude);
            const stLon = parseFloat(st.Longitude);
            if (isNaN(stLat) || isNaN(stLon)) return;
            
            const dist = calculateDistance(lat, lon, stLat, stLon);
            if (dist < minDistance) {
                minDistance = dist;
                closestStation = st;
            }
        });
        
        // Promień 80 metrów (0.08 km) - idealny dla stacji benzynowej z parkingiem
        const GEOFENCE_RADIUS_KM = 0.08;
        
        if (closestStation && minDistance <= GEOFENCE_RADIUS_KM) {
            // Reagujemy tylko raz przy wjeździe na stację
            if (lastGeofenceOpenedId !== closestStation.ID_Punktu) {
                lastGeofenceOpenedId = closestStation.ID_Punktu;
                
                // Przełącz na mapę, wyśrodkuj na stację i otwórz panel
                switchToTab('tab-map');
                const latVal = parseFloat(closestStation.Latitude);
                const lonVal = parseFloat(closestStation.Longitude);
                if (map && !isNaN(latVal) && !isNaN(lonVal)) {
                    map.setView([latVal, lonVal], 16);
                }
                
                setTimeout(() => {
                    openStationDetails(closestStation, true); // true oznaczające automatyczne wykrycie
                }, 350);
                
                showToast(`📍 GPS: Wykryto obecność na stacji ${closestStation.Nazwa_Stacji}!`);
            }
        } else {
            // Resetuj blokadę po oddaleniu się od stacji na odległość powyżej 150 metrów
            if (lastGeofenceOpenedId) {
                const lastStation = stations.find(s => s.ID_Punktu === lastGeofenceOpenedId);
                if (lastStation) {
                    const dist = calculateDistance(lat, lon, parseFloat(lastStation.Latitude), parseFloat(lastStation.Longitude));
                    if (dist > 0.15) {
                        lastGeofenceOpenedId = null;
                    }
                } else {
                    lastGeofenceOpenedId = null;
                }
            }
        }

        // Dodatkowo geofencing / ostrzeżenie o bliskości (promień 200m - 0.2 km) dla stacji niezrobionych
        const PROXIMITY_RADIUS_KM = 0.20;
        if (closestStation && minDistance <= PROXIMITY_RADIUS_KM && closestStation.Status !== 'Zrobione') {
            if (!notifiedStations.has(closestStation.ID_Punktu)) {
                notifiedStations.add(closestStation.ID_Punktu);
                proximityActiveStation = closestStation;
                
                // Pokaż baner w aplikacji
                const proximityBanner = document.getElementById('proximity-alert-banner');
                const proximityText = document.getElementById('proximity-alert-text');
                if (proximityBanner && proximityText) {
                    proximityText.textContent = `Czy byłeś na stacji ${closestStation.Nazwa_Stacji} (${closestStation.Adres.split(',')[0]})? Dodaj raport z wizyty.`;
                    proximityBanner.style.display = 'flex';
                }
                
                // Wyślij powiadomienie systemowe (jeśli wyrażono zgodę)
                if (window.Notification && Notification.permission === "granted") {
                    try {
                        const notify = new Notification("Wykryto stację Orlen w pobliżu!", {
                            body: `Czy odwiedziłeś stację ${closestStation.Nazwa_Stacji}? Kliknij, aby dodać notatki i raport.`,
                            icon: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Orlen_Logo.svg"
                        });
                        
                        notify.onclick = function() {
                            window.focus();
                            const proximityBtnYes = document.getElementById('proximity-btn-yes');
                            if (proximityBtnYes) proximityBtnYes.click();
                        };
                    } catch (e) {
                        console.warn("Błąd wysyłania powiadomienia", e);
                    }
                }
            }
        }
    }

    // Obsługa lokalizacji GPS (tylko real GPS)
    function handleGpsLocationChange(val) {
        if (val !== 'device') {
            if (gpsSimSelect.value !== 'device') {
                gpsSimSelect.value = 'device';
            }
            showToast("Dostępny jest tylko tryb Real GPS");
            return;
        }

        // Zatrzymujemy ciągłe śledzenie z poprzedniego wyboru
        if (gpsWatchId) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
        
        if (val === 'device') {
            if (navigator.geolocation) {
                showToast("Pobieranie pozycji z GPS urządzenia...");
                // Pobieramy pozycję raz, aby szybko zaktualizować interfejs
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        gpsSimLocation.lat = position.coords.latitude;
                        gpsSimLocation.lon = position.coords.longitude;
                        gpsCoordsText.textContent = `Szerokość: ${gpsSimLocation.lat.toFixed(5)}, Długość: ${gpsSimLocation.lon.toFixed(5)} (Real GPS)`;
                        
                        updateUserLocationMarker();
                        updateStationsListView();
                        if (map) {
                            map.setView([gpsSimLocation.lat, gpsSimLocation.lon], 15);
                        }
                        
                        checkGeofencing(gpsSimLocation.lat, gpsSimLocation.lon);
                        
                        // Uruchamiamy ciągłe śledzenie w czasie rzeczywistym
                        gpsWatchId = navigator.geolocation.watchPosition(
                            (pos) => {
                                gpsSimLocation.lat = pos.coords.latitude;
                                gpsSimLocation.lon = pos.coords.longitude;
                                gpsCoordsText.textContent = `Szerokość: ${gpsSimLocation.lat.toFixed(5)}, Długość: ${gpsSimLocation.lon.toFixed(5)} (Śledzenie GPS)`;
                                
                                updateUserLocationMarker();
                                updateStationsListView();
                                checkGeofencing(gpsSimLocation.lat, gpsSimLocation.lon);
                            },
                            (error) => {
                                console.warn("Błąd ciągłego śledzenia GPS", error);
                            },
                            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
                        );
                    },
                    (error) => {
                        console.error(error);
                        alert("Błąd pobierania pozycji GPS. Upewnij się, że wyraziłeś zgodę na udostępnienie lokalizacji.");
                    }
                );
            } else {
                alert("Twoje urządzenie nie wspiera geolokalizacji.");
            }
        }
    }

    // Pokaż Toast
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    function refreshUI() {
        updateStats();
        updateStationsListView();
    }

    // ==========================================================================
    // POMOCNICZE FUNKCJE MATEMATYCZNE I DAT
    // ==========================================================================
    
    // Obliczanie odległości między współrzędnymi (Haversine formula)
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Promień Ziemi w km
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c; // Odległość w km
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI/180);
    }

    // Formatowanie daty do postaci YYYY-MM-DD HH:MM:SS
    function getFormattedDate() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

});
