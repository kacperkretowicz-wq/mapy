/* ==========================================================================
   Logika Biznesowa - System CRM z Mapą dla Handlowców Orlen (SFA)
   Wsparcie dla Leaflet.js, GPS, localStorage, RLS, CSV
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    window.__APP_RUN_COUNT = (window.__APP_RUN_COUNT || 0) + 1;

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
    let completedVisitsHistory = [];
    let suggestedVisits = [];
    let territoryLayerGroup = null; // Warstwa obszarów handlowców
    let routeAlongStations = []; // Stacje po drodze
    let routeAlongPolyline = null; // Linia trasy po drodze
    let roadRouteLayer = null; // Warstwa realnej trasy po drogach (OSRM)
    let roadRouteCasingLayer = null; // Biała obwódka trasy (styl Google)
    let lastRouteLegs = []; // Etapy trasy do Google Maps (obejście limitu 10 przystanków)
    
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
    const searchInput = document.getElementById('map-search-input');
    const searchInputOld = document.getElementById('search-input'); // Dla wstecznej kompatybilnosci
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const statusFilter = document.getElementById('status-filter');
    const auditFilter = document.getElementById('audit-filter');
    const gpsSimSelect = document.getElementById('gps-sim-select');
    const resetListFiltersBtn = document.getElementById('reset-list-filters-btn');
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
    const sheetMarkDuplicateBtn = document.getElementById('sheet-mark-duplicate-btn');
    
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
    const clearAssignmentsBtn = document.getElementById('clear-assignments-btn');
    const syncOsmBtn = document.getElementById('sync-osm-btn');
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
        
        // 4. Załaduj playlistę trasy i historię wykonanych tras
        loadCustomRouteList();
        loadCompletedVisitsHistory();
        loadSuggestedVisits();
        
        // 5. Odśwież widoki i liczniki
        refreshUI();

        // 6. Synchronizacja na żywo między handlowcami (Firebase, jeśli skonfigurowane)
        if (window.OrlenSync) {
            OrlenSync.seed(stations);
            OrlenSync.init(window.ORLEN_FIREBASE_CONFIG, { onRemoteChange: applyRemoteStationUpdate })
                .then(res => {
                    if (res && res.enabled) {
                        showToast('Synchronizacja na żywo aktywna.');
                    }
                });
        }
    }

    // Zastosuj zmiany przysłane przez innego handlowca (z chmury)
    function applyRemoteStationUpdate(updatesMap) {
        let changed = 0;
        const byId = {};
        stations.forEach(st => { byId[String(st.ID_Punktu)] = st; });

        Object.keys(updatesMap).forEach(id => {
            const st = byId[id];
            if (!st) return;
            const remote = updatesMap[id] || {};
            ['Status', 'Handlowiec', 'Notatki', 'Ostatnia_Aktualizacja'].forEach(f => {
                if (remote[f] !== undefined && remote[f] !== st[f]) {
                    st[f] = remote[f];
                    changed++;
                }
            });
        });

        if (changed) {
            saveToLocalStorage();
            refreshUI();
            // Jeśli otwarty jest panel edytowanej stacji – odśwież jego widok
            if (selectedStation && byId[String(selectedStation.ID_Punktu)]) {
                const fresh = byId[String(selectedStation.ID_Punktu)];
                if (sheetStatusBadge) {
                    sheetStatusBadge.textContent = fresh.Status;
                    sheetStatusBadge.setAttribute('data-status', fresh.Status);
                }
                if (sheetAssigneeSelect) sheetAssigneeSelect.value = fresh.Handlowiec || '';
            }
        }
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
                
                // Automatyczna migracja do finalnej bazy 2026 (2149 stacji wg mapy oficjalnej):
                // Jeśli baza w localStorage nie ma dokładnie 2149 stacji lub nie posiada atrybutu Audyt,
                // automatycznie wczytujemy zaktualizowaną bazę stacje_orlen.json.
                const hasAuditField = stations.length > 0 && stations[0].hasOwnProperty('Audyt');
                if (stations.length !== 2149 || !hasAuditField) {
                    console.log("Baza w localStorage wymaga aktualizacji do wersji 2026 (2149 stacji). Ładuję stacje_orlen.json...");
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
                    saveToLocalStorage();
                    console.log("Dane pobrane ze stacje_orlen.json (ilość:", stations.length, ")");
                    showToast("Wczytano pełną bazę stacji z pliku JSON");
                    return true;
                }
            }
        } catch (e) {
            console.log("Brak możliwości pobrania JSON (prawdopodobnie file:// lub offline). Ładuję fallback.");
        }
        
        // Ostateczny fallback – tylko gdy naprawdę nie mamy żadnych danych.
        // Dzięki temu chwilowy błąd sieci nie nadpisze poprawnej bazy 7 demo-stacjami.
        if (!stations || stations.length === 0) {
            stations = [...fallbackStations];
            saveToLocalStorage();
            console.log("Załadowano wbudowaną bazę fallback (ilość:", stations.length, ")");
        } else {
            console.log("Nie udało się pobrać JSON – zachowuję istniejące dane (ilość:", stations.length, ")");
        }
        return false;
    }

    function saveToLocalStorage() {
        localStorage.setItem('orlen_crm_stations', JSON.stringify(stations));
        // Wypchnij zmienione stacje do chmury (jeśli synchronizacja aktywna)
        if (window.OrlenSync && OrlenSync.isEnabled()) {
            OrlenSync.syncFromStations(stations);
        }
    }

    function fitMapToFilteredStations() {
        if (!map || !markerClusterGroup) return;
        const visibleStations = getFilteredStations();
        if (!visibleStations.length) return;
        const bounds = L.latLngBounds([]);
        visibleStations.forEach(st => {
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            if (!isNaN(lat) && !isNaN(lon)) bounds.extend([lat, lon]);
        });
        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.1));
        }
    }

    // Uzupełnia brakujące pola, ale nie nadpisuje istniejących statusów/notatek.
    function mockAssignSalespeople(data) {
        data.forEach((st) => {
            if (st.Handlowiec === undefined || st.Handlowiec === null) st.Handlowiec = '';
            if (!st.Status) st.Status = 'Do zrobienia';
            if (!st.Ostatnia_Aktualizacja) st.Ostatnia_Aktualizacja = '';
            if (st.Notatki === undefined || st.Notatki === null) st.Notatki = '';
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

    // Synchronizacja Google Sheets została całkowicie wyłączona
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
    
    function openRouteInGoogleMaps(route, emptyMsg) {
        const routeInput = Array.isArray(route) ? route : [];
        const validRoute = routeInput.filter(st => {
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            return !isNaN(lat) && !isNaN(lon);
        });
        
        if (validRoute.length === 0) {
            alert(emptyMsg);
            return;
        }
        
        // Mobilne Google Maps bywa niestabilne dla bardzo długich URL-i i zbyt wielu waypointów.
        // Używamy maks. 10 punktów (origin + 8 waypointów + destination).
        const MAX_STOPS_FOR_GMAPS = 10;
        let routeToOpen = validRoute;
        if (validRoute.length > MAX_STOPS_FOR_GMAPS - 1) {
            routeToOpen = validRoute.slice(0, MAX_STOPS_FOR_GMAPS - 1);
            showToast(`Google Maps: otwarto pierwsze ${routeToOpen.length} punktów. Resztę zaplanuj w kolejnym kroku.`);
        }
        
        const start = `${gpsSimLocation.lat},${gpsSimLocation.lon}`;
        const destSt = routeToOpen[routeToOpen.length - 1];
        const dest = `${destSt.Latitude},${destSt.Longitude}`;
        
        const intermediate = routeToOpen.slice(0, -1);
        const waypoints = intermediate.map(st => `${st.Latitude},${st.Longitude}`);
        
        let gmapsUrl = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest)}`;
        if (waypoints.length > 0) {
            gmapsUrl += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
        }
        
        window.open(gmapsUrl, '_blank');
    }

    function openPlannedRouteInGoogleMaps() {
        if (!window.lastPlannedRoute || window.lastPlannedRoute.length === 0) {
            alert("Najpierw zaplanuj trasę!");
            return;
        }
        openRouteInGoogleMaps(window.lastPlannedRoute, "Najpierw zaplanuj trasę!");
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
        reconcileCustomRouteList();
        updateCustomRouteUI();
    }

    function saveCustomRouteList() {
        reconcileCustomRouteList();
        localStorage.setItem('orlen_custom_route', JSON.stringify(customRouteList));
        updateCustomRouteUI();
    }

    function reconcileCustomRouteList() {
        const stationById = {};
        stations.forEach(st => {
            stationById[String(st.ID_Punktu || '').trim()] = st;
        });

        const seen = new Set();
        const normalized = [];
        customRouteList.forEach(item => {
            const id = String(item?.ID_Punktu || '').trim();
            if (!id || seen.has(id)) return;
            const current = stationById[id];
            if (!current) return;
            if (current.Status === 'Zrobione') return;
            seen.add(id);
            normalized.push(current);
        });
        customRouteList = normalized;
    }

    function loadCompletedVisitsHistory() {
        const data = localStorage.getItem('orlen_completed_visits_history');
        if (data) {
            try {
                completedVisitsHistory = JSON.parse(data);
            } catch (e) {
                completedVisitsHistory = [];
            }
        }
        updateCompletedVisitsHistoryUI();
    }

    function saveCompletedVisitsHistory() {
        localStorage.setItem('orlen_completed_visits_history', JSON.stringify(completedVisitsHistory));
        updateCompletedVisitsHistoryUI();
    }

    function logCompletedVisit(station, source = 'manual') {
        if (!station) return;
        const entry = {
            id: `${station.ID_Punktu}_${Date.now()}`,
            stationId: station.ID_Punktu,
            stationName: station.Nazwa_Stacji,
            address: station.Adres || '',
            handlowiec: station.Handlowiec || '',
            notes: station.Notatki || '',
            doneAt: station.Ostatnia_Aktualizacja || getFormattedDate(),
            source
        };
        completedVisitsHistory.unshift(entry);
        completedVisitsHistory = completedVisitsHistory.slice(0, 500);
        saveCompletedVisitsHistory();
    }

    function updateCompletedVisitsHistoryUI() {
        const listEl = document.getElementById('history-list');
        const emptyEl = document.getElementById('history-empty');
        if (!listEl || !emptyEl) return;

        if (!completedVisitsHistory.length) {
            listEl.style.display = 'none';
            emptyEl.style.display = 'block';
            listEl.innerHTML = '';
            return;
        }

        emptyEl.style.display = 'none';
        listEl.style.display = 'block';
        listEl.innerHTML = '';

        completedVisitsHistory.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <strong>${item.stationName}</strong>
                    <span class="history-meta">${item.stationId} • ${item.doneAt}</span>
                    <span class="history-meta">${(item.address || '').split(',')[0] || item.address}</span>
                    <span class="history-meta">Handlowiec: ${item.handlowiec || 'brak'}</span>
                    <span class="history-note">${item.notes ? item.notes : 'Brak notatki'}</span>
                </div>
            `;
            listEl.appendChild(li);
        });
    }

    function shouldMarkDoneFromNotes(notes) {
        const txt = (notes || '').toLowerCase();
        return /ogarniete|ogarnięte|ograniete|zrobione|załatwione|zalatwione/.test(txt);
    }

    function isMarkedDuplicate(station) {
        return (station?.Notatki || '').includes('[DUPLIKAT]');
    }

    function updateDuplicateButtonState() {
        if (!sheetMarkDuplicateBtn || !selectedStation) return;
        if (isMarkedDuplicate(selectedStation)) {
            sheetMarkDuplicateBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Usuń oznaczenie duplikatu';
            sheetMarkDuplicateBtn.style.backgroundColor = '#6b7280';
            sheetMarkDuplicateBtn.style.color = '#ffffff';
            sheetMarkDuplicateBtn.style.borderColor = '#6b7280';
        } else {
            sheetMarkDuplicateBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Oznacz jako duplikat';
            sheetMarkDuplicateBtn.style.backgroundColor = '';
            sheetMarkDuplicateBtn.style.color = '';
            sheetMarkDuplicateBtn.style.borderColor = '';
        }
    }

    function toggleDuplicateMarkForSelectedStation() {
        if (!selectedStation) return;
        const duplicateTag = '[DUPLIKAT]';
        const currentNotes = (selectedStation.Notatki || '').trim();
        const alreadyDuplicate = currentNotes.includes(duplicateTag);
        if (alreadyDuplicate) {
            selectedStation.Notatki = currentNotes.replace(duplicateTag, '').replace(/\s{2,}/g, ' ').trim();
        } else {
            selectedStation.Notatki = currentNotes ? `${duplicateTag} ${currentNotes}` : duplicateTag;
        }
        selectedStation.Ostatnia_Aktualizacja = getFormattedDate();
        saveToLocalStorage();
        refreshUI();
        updateDuplicateButtonState();
        showToast(alreadyDuplicate ? "Usunięto oznaczenie duplikatu" : "Oznaczono jako duplikat");
    }

    function removeStationFromCustomRouteList(stationId) {
        const before = customRouteList.length;
        customRouteList = customRouteList.filter(s => s.ID_Punktu !== stationId);
        if (customRouteList.length !== before) {
            saveCustomRouteList();
        }
    }

    function setStatusAfterRouteRemoval(stationId) {
        const stationInDb = stations.find(s => s.ID_Punktu === stationId);
        if (!stationInDb) return;
        if (stationInDb.Status === 'Zrobione') {
            return;
        }
        stationInDb.Status = shouldMarkDoneFromNotes(stationInDb.Notatki) ? 'Zrobione' : 'Do zrobienia';
        stationInDb.Ostatnia_Aktualizacja = getFormattedDate();
        if (selectedStation && selectedStation.ID_Punktu === stationId) {
            selectedStation.Status = stationInDb.Status;
            selectedStation.Ostatnia_Aktualizacja = stationInDb.Ostatnia_Aktualizacja;
        }
    }

    function toggleCustomRoute(station) {
        const idx = customRouteList.findIndex(s => s.ID_Punktu === station.ID_Punktu);
        if (idx !== -1) {
            customRouteList.splice(idx, 1);
            setStatusAfterRouteRemoval(station.ID_Punktu);
            saveToLocalStorage();
            refreshUI();
            showToast("Usunięto stację z trasy");
        } else {
            customRouteList.push(station);
            // Dodanie do trasy oznacza rozpoczęcie pracy na stacji (żółty status "W trakcie")
            const stationInDb = stations.find(s => s.ID_Punktu === station.ID_Punktu);
            if (stationInDb) {
                stationInDb.Status = 'W trakcie';
                stationInDb.Ostatnia_Aktualizacja = getFormattedDate();
            }
            if (selectedStation && selectedStation.ID_Punktu === station.ID_Punktu) {
                selectedStation.Status = 'W trakcie';
                selectedStation.Ostatnia_Aktualizacja = getFormattedDate();
            }
            saveToLocalStorage();
            refreshUI();
            showToast("Dodano stację do dzisiejszej trasy");
        }
        if (selectedStation && selectedStation.ID_Punktu === station.ID_Punktu) {
            openStationDetails(selectedStation);
        }
        saveCustomRouteList();
    }

    function removeFromCustomRoute(stationId) {
        removeStationFromCustomRouteList(stationId);
        setStatusAfterRouteRemoval(stationId);
        saveToLocalStorage();
        refreshUI();
        if (selectedStation && selectedStation.ID_Punktu === stationId) {
            openStationDetails(selectedStation);
        }
        showToast("Usunięto stację z trasy");
    }

    function updateCustomRouteUI() {
        const previousLen = customRouteList.length;
        reconcileCustomRouteList();
        if (customRouteList.length !== previousLen) {
            localStorage.setItem('orlen_custom_route', JSON.stringify(customRouteList));
        }

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
                let statusClass = 'todo';
                if (st.Status === 'W trakcie') statusClass = 'progress';
                else if (st.Status === 'Zrobione') statusClass = 'done';
                
                const isMotorwayReview = (st.Notatki || '').includes('MOP/AUTOSTRADA - BRAK PEŁNEGO ADRESU');
                const isDuplicate = isMarkedDuplicate(st);
                if (st.Status === 'Do zrobienia') {
                    if (isMotorwayReview) statusClass = 'motorway';
                    else if (isDuplicate) statusClass = 'duplicate';
                }

                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; width: calc(100% - 30px);">
                        <div class="card-status-dot ${statusClass}" style="margin-top: 0;" title="${st.Status}"></div>
                        <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <strong style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${st.Nazwa_Stacji}</strong>
                            <span style="font-size: 0.7rem; color: var(--dark-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${st.Adres.split(',')[0]}</span>
                        </div>
                    </div>
                    <button class="remove-btn" data-id="${st.ID_Punktu}"><i class="fa-solid fa-trash-can"></i></button>
                `;
                li.querySelector('.remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromCustomRoute(st.ID_Punktu);
                });
                
                // Kliknięcie w element listy trasy centruje na nim mapę i otwiera Bottom Sheet
                li.addEventListener('click', () => {
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

    function planCustomRoute(options = {}) {
        if (customRouteList.length === 0) {
            alert("Dodaj najpierw stacje do trasy!");
            return;
        }

        const optModeSelect = document.getElementById('route-custom-optimization');
        let optMode = optModeSelect ? optModeSelect.value : 'tsp';
        // Trasa "do miasta" jest już logicznie posortowana wzdłuż korytarza – nie mieszaj TSP
        if (options && options.preserveOrder) optMode = 'manual';
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
        document.getElementById('route-custom-total-distance').textContent = `${totalDist.toFixed(1)} km (w linii prostej)`;

        const travelTimeMin = Math.round((totalDist / 40) * 60);
        const visitTimeMin = routeSequence.length * 15;
        document.getElementById('route-custom-est-time').textContent = `~${travelTimeMin} min dojazdu (+ ${visitTimeMin} min wizyty)`;

        const stopsListEl = document.getElementById('route-custom-stops-list');
        stopsListEl.innerHTML = '';
        routeSequence.forEach((st, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${idx + 1}. ${st.Nazwa_Stacji}</strong> — ${(st.Adres || '').split(',')[0]} <span style="color: var(--dark-muted);">(ok. ${st.temp_dist.toFixed(1)} km)</span>`;
            stopsListEl.appendChild(li);
        });

        document.getElementById('route-custom-results').style.display = 'block';
        window.lastPlannedCustomRoute = routeSequence;

        // Zbuduj etapy do Google Maps (obejście limitu 10 przystanków)
        renderGmapsLegs(routeSequence);

        // Narysuj realną trasę po drogach na mapie (OSRM) + zaktualizuj dokładny dystans/czas
        showToast("Wyznaczam trasę po drogach...");
        drawRoadRoute(routeSequence).then(result => {
            if (result && result.distance != null) {
                const km = (result.distance / 1000);
                const driveMin = Math.round(result.duration / 60);
                document.getElementById('route-custom-total-distance').textContent = `${km.toFixed(1)} km (po drogach)`;
                document.getElementById('route-custom-est-time').textContent = `${driveMin} min jazdy (+ ${visitTimeMin} min wizyty)`;
                showToast("Trasa wyznaczona po drogach!");
            } else {
                showToast("Trasa gotowa (przybliżona – brak danych drogowych).");
            }
        });
    }

    // ==========================================================================
    // WYSZUKIWANIE MIASTA → TRASA PO DRODZE (scenariusz "Leszno")
    // ==========================================================================
    let pendingRouteQuery = '';
    let candidateLayer = null; // warstwa "stacji po drodze" (dodawalnych) na mapie
    let candidateMarkers = {}; // id -> marker (osobno, by nie serializować markerów Leaflet)
    let routePlanning = { active: false, destinations: [], candidates: [], added: new Set(), query: '' };

    // Parametr położenia rzutu punktu na odcinek [a,b] (0 = start, 1 = cel)
    function projectionT(point, a, b) {
        const cosLat = Math.cos(a[0] * Math.PI / 180);
        const toXY = ([la, lo]) => [lo * 111.32 * cosLat, la * 110.57];
        const p = toXY(point), A = toXY(a), B = toXY(b);
        const dx = B[0] - A[0], dy = B[1] - A[1];
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return 0;
        return ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / lenSq;
    }

    function findStationsMatchingQuery(query) {
        const q = (query || '').toLowerCase().trim();
        if (!q) return [];
        return stations.filter(st => {
            const c = (st.Miasto || '').toLowerCase();
            const a = (st.Adres || '').toLowerCase();
            const n = (st.Nazwa_Stacji || '').toLowerCase();
            return c.includes(q) || a.includes(q) || n.includes(q);
        });
    }

    // Pokaż okno "cel wyszukiwania" (po wpisaniu miasta i Enter)
    function showRouteToCityPrompt(query) {
        const matches = findStationsMatchingQuery(query);
        if (!matches.length) {
            showToast(`Nie znaleziono Orlenów dla: "${query}".`);
            return;
        }
        pendingRouteQuery = query;
        // Dopasuj widok mapy do znalezionych stacji
        if (map) {
            const b = L.latLngBounds(matches
                .map(s => [parseFloat(s.Latitude), parseFloat(s.Longitude)])
                .filter(c => !isNaN(c[0]) && !isNaN(c[1])));
            if (b.isValid()) map.fitBounds(b.pad(0.3));
        }
        const destEl = document.getElementById('route-prompt-dest');
        if (destEl) destEl.textContent = `${query} (${matches.length} Orlenów)`;
        const promptEl = document.getElementById('route-along-prompt');
        if (promptEl) promptEl.style.display = 'flex';
    }

    // Rozpocznij planowanie trasy do miasta – pokaż stacje "po drodze" NA MAPIE (dodawalne)
    function planRouteToCity(query, opts = {}) {
        const matches = findStationsMatchingQuery(query);
        if (!matches.length) {
            alert(`Nie znaleziono Orlenów dla: "${query}".`);
            return;
        }
        const promptEl = document.getElementById('route-along-prompt');
        if (promptEl) promptEl.style.display = 'none';
        if (searchInput) searchInput.value = ''; // pokaż korytarz, nie tylko miasto

        const start = [gpsSimLocation.lat, gpsSimLocation.lon];
        matches.forEach(st => {
            st._destDist = calculateDistance(start[0], start[1], parseFloat(st.Latitude), parseFloat(st.Longitude));
        });
        const dest = matches.reduce((a, b) => (b._destDist > a._destDist ? b : a), matches[0]);
        const end = [parseFloat(dest.Latitude), parseFloat(dest.Longitude)];
        if (isNaN(end[0]) || isNaN(end[1])) { alert("Brak współrzędnych celu."); return; }

        // Cele (końcowe) = Orleny w mieście, niezrobione
        const destinations = matches.filter(m => m.Status !== 'Zrobione');
        if (!destinations.length) { alert(`Wszystkie Orleny w "${query}" są już zrobione.`); return; }

        // Kandydaci "po drodze" = wąski korytarz między pozycją a celem (bez celów, bez zrobionych)
        const CORRIDOR_KM = 3;
        let candidates = stations.filter(st => {
            if (st.Status === 'Zrobione') return false;
            if (opts.onlyAudit && st.Audyt !== 'Tak') return false;
            if (matches.some(m => m.ID_Punktu === st.ID_Punktu)) return false;
            const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) return false;
            const t = projectionT([lat, lon], start, end);
            if (t < 0.02 || t > 0.98) return false;
            return getDistanceToSegment([lat, lon], start, end) <= CORRIDOR_KM;
        });
        candidates.forEach(st => { st._t = projectionT([parseFloat(st.Latitude), parseFloat(st.Longitude)], start, end); });
        candidates.sort((a, b) => a._t - b._t);

        routePlanning = { active: true, destinations, candidates, added: new Set(), query };

        // Trasa startowa = tylko cele (końcowe). Kandydatów dokłada użytkownik klikając na mapie.
        customRouteList = destinations.map(st => stations.find(s => s.ID_Punktu === st.ID_Punktu) || st);
        saveCustomRouteList();

        switchToTab('tab-map');
        updateMapMarkers(); // odśwież piny (bez filtra miasta) – widać całą okolicę trasy
        renderRouteCandidates();
        recomputeCityRoute();
        showRoutePlanningBar();
        showToast(`Cel: ${query}. Kliknij zielone punkty "po drodze", aby dodać je do trasy.`);
    }

    // Narysuj kandydatów "po drodze" jako dodawalne znaczniki na mapie
    function makeCandidateIcon(added) {
        return L.divIcon({
            className: 'route-cand-wrap',
            html: `<div class="route-cand ${added ? 'added' : ''}"><i class="fa-solid ${added ? 'fa-check' : 'fa-plus'}"></i></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
    }

    function renderRouteCandidates() {
        if (candidateLayer && map) map.removeLayer(candidateLayer);
        candidateLayer = L.layerGroup().addTo(map);
        routePlanning.candidates.forEach(st => {
            const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) return;
            const added = routePlanning.added.has(st.ID_Punktu);
            const m = L.marker([lat, lon], { icon: makeCandidateIcon(added), zIndexOffset: 1000 });
            m.on('click', () => toggleCandidate(st));
            st._candMarker = m;
            candidateLayer.addLayer(m);
        });
    }

    function toggleCandidate(st) {
        if (routePlanning.added.has(st.ID_Punktu)) routePlanning.added.delete(st.ID_Punktu);
        else routePlanning.added.add(st.ID_Punktu);
        if (st._candMarker) st._candMarker.setIcon(makeCandidateIcon(routePlanning.added.has(st.ID_Punktu)));
        console.log('[DBG] toggle', st.ID_Punktu, 'added.size=', routePlanning.added.size, 'candidates=', routePlanning.candidates.length, 'destinations=', routePlanning.destinations.length);
        recomputeCityRoute();
    }

    // Zbuduj optymalną, monotoniczną trasę (bez zawracania) i narysuj po drogach
    function recomputeCityRoute() {
        const start = [gpsSimLocation.lat, gpsSimLocation.lon];
        const dest = routePlanning.destinations.reduce((a, b) => ((a && a._destDist > b._destDist) ? a : b), routePlanning.destinations[0]);
        const end = [parseFloat(dest.Latitude), parseFloat(dest.Longitude)];

        const addedStations = routePlanning.candidates.filter(c => routePlanning.added.has(c.ID_Punktu));
        let full = [...addedStations, ...routePlanning.destinations];
        // Kolejność wzdłuż trasy (monotoniczny postęp = brak nadkładania drogi)
        full.forEach(st => { st._t = projectionT([parseFloat(st.Latitude), parseFloat(st.Longitude)], start, end); });
        full.sort((a, b) => a._t - b._t);

        customRouteList = full.map(st => stations.find(s => s.ID_Punktu === st.ID_Punktu) || st);
        console.log('[DBG] recompute: added=', routePlanning.added.size, 'full=', full.length, 'customRouteList=', customRouteList.length);
        saveCustomRouteList();
        console.log('[DBG] after save customRouteList=', customRouteList.length);

        window.lastPlannedCustomRoute = customRouteList;
        renderGmapsLegs(customRouteList);
        updateRoutePlanningBar(null);
        drawRoadRoute(customRouteList).then(r => updateRoutePlanningBar(r));
    }

    function showRoutePlanningBar() {
        const bar = document.getElementById('route-plan-bar');
        if (bar) bar.style.display = 'flex';
    }

    function updateRoutePlanningBar(osrmResult) {
        const bar = document.getElementById('route-plan-bar');
        if (!bar) return;
        const destName = document.getElementById('route-plan-dest');
        const meta = document.getElementById('route-plan-meta');
        if (destName) destName.textContent = routePlanning.query;
        const stops = customRouteList.length;
        const addedCount = routePlanning.added.size;
        let metaText = `${stops} przystanków (${addedCount} po drodze)`;
        if (osrmResult && osrmResult.distance != null) {
            const km = (osrmResult.distance / 1000).toFixed(0);
            const min = Math.round(osrmResult.duration / 60);
            metaText += ` • ${km} km • ${min} min jazdy`;
        }
        if (meta) meta.textContent = metaText;
    }

    function endRoutePlanning() {
        routePlanning.active = false;
        if (candidateLayer && map) { map.removeLayer(candidateLayer); candidateLayer = null; }
        clearOSRMRoute();
        const bar = document.getElementById('route-plan-bar');
        if (bar) bar.style.display = 'none';
    }

    function addAllCandidatesToRoute() {
        routePlanning.candidates.forEach(c => routePlanning.added.add(c.ID_Punktu));
        renderRouteCandidates();
        recomputeCityRoute();
        showToast(`Dodano wszystkie stacje po drodze (${routePlanning.candidates.length}).`);
    }

    // "Prowadź bezpośrednio" – nawiguj do najbliższego Orlenu w mieście
    function navigateDirectToCity(query) {
        const matches = findStationsMatchingQuery(query);
        if (!matches.length) { alert(`Nie znaleziono Orlenów dla: "${query}".`); return; }
        matches.forEach(st => {
            st._destDist = calculateDistance(gpsSimLocation.lat, gpsSimLocation.lon, parseFloat(st.Latitude), parseFloat(st.Longitude));
        });
        const nearest = matches.reduce((a, b) => (b._destDist < a._destDist ? b : a), matches[0]);
        const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${gpsSimLocation.lat},${gpsSimLocation.lon}&destination=${nearest.Latitude},${nearest.Longitude}`;
        window.open(url, '_blank');
        const promptEl = document.getElementById('route-along-prompt');
        if (promptEl) promptEl.style.display = 'none';
    }

    // ==========================================================================
    // REALNA TRASA PO DROGACH (OSRM) + STYL GOOGLE MAPS
    // ==========================================================================
    async function drawRoadRoute(orderedStations) {
        if (!map) return null;
        clearOSRMRoute();

        // Punkty: start = pozycja GPS, dalej stacje w kolejności
        const points = [{ lat: gpsSimLocation.lat, lon: gpsSimLocation.lon }];
        orderedStations.forEach(st => {
            const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
            if (!isNaN(lat) && !isNaN(lon)) points.push({ lat, lon });
        });
        if (points.length < 2) return null;

        const coordStr = points.map(p => `${p.lon},${p.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.routes && data.routes[0] && data.routes[0].geometry) {
                    const geom = data.routes[0].geometry;
                    // Biała obwódka pod spodem (efekt "google")
                    roadRouteCasingLayer = L.geoJSON(geom, {
                        style: { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }
                    }).addTo(map);
                    roadRouteLayer = L.geoJSON(geom, {
                        style: { color: '#1a73e8', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
                    }).addTo(map);
                    const b = roadRouteLayer.getBounds();
                    if (b.isValid()) map.fitBounds(b.pad(0.12));
                    return { distance: data.routes[0].distance, duration: data.routes[0].duration };
                }
            }
        } catch (e) {
            console.warn("OSRM niedostępny, rysuję linię przybliżoną:", e);
        }

        // Fallback: linia łamana (przerywana) po punktach
        const latlngs = points.map(p => [p.lat, p.lon]);
        roadRouteLayer = L.polyline(latlngs, {
            color: '#1a73e8', weight: 4, opacity: 0.8, dashArray: '2,10', lineCap: 'round'
        }).addTo(map);
        const b = roadRouteLayer.getBounds();
        if (b.isValid()) map.fitBounds(b.pad(0.12));
        return null;
    }

    // Podział trasy na etapy po max 10 przystanków (limit Google Maps)
    function buildGmapsLegs(orderedStations) {
        const valid = orderedStations.filter(st => {
            const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
            return !isNaN(lat) && !isNaN(lon);
        });
        const LEG_SIZE = 10; // 10 przystanków (stacji) na jeden etap Google Maps
        const legs = [];
        let originLat = gpsSimLocation.lat;
        let originLon = gpsSimLocation.lon;

        for (let i = 0; i < valid.length; i += LEG_SIZE) {
            const chunk = valid.slice(i, i + LEG_SIZE);
            const dest = chunk[chunk.length - 1];
            const waypoints = chunk.slice(0, -1).map(s => `${s.Latitude},${s.Longitude}`);
            let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${originLat},${originLon}&destination=${dest.Latitude},${dest.Longitude}`;
            if (waypoints.length > 0) {
                url += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
            }
            legs.push({ url, from: i + 1, to: i + chunk.length, count: chunk.length });
            originLat = parseFloat(dest.Latitude);
            originLon = parseFloat(dest.Longitude);
        }
        return legs;
    }

    // Wyrenderuj przyciski etapów Google Maps
    function renderGmapsLegs(orderedStations) {
        lastRouteLegs = buildGmapsLegs(orderedStations);
        const legsContainer = document.getElementById('route-custom-gmaps-legs');
        const mainBtn = document.getElementById('route-custom-open-gmaps-btn');
        if (!legsContainer) return;

        legsContainer.innerHTML = '';

        if (lastRouteLegs.length <= 1) {
            // Jeden etap – wystarczy główny przycisk
            if (mainBtn) {
                mainBtn.style.display = 'flex';
                mainBtn.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Otwórz trasę w Google Maps';
            }
            return;
        }

        // Wiele etapów – ukryj główny przycisk, pokaż listę etapów
        if (mainBtn) mainBtn.style.display = 'none';

        const info = document.createElement('div');
        info.style.cssText = 'font-size:0.75rem;color:var(--dark-muted);margin-bottom:8px;display:flex;gap:6px;align-items:flex-start;';
        info.innerHTML = `<i class="fa-solid fa-circle-info" style="color:var(--primary);margin-top:2px;"></i> <span>Trasa ma ${orderedStations.length} przystanków, a Google Maps obsługuje max 10. Podzieliłem ją na <strong>${lastRouteLegs.length} etapy</strong> — każdy zaczyna się tam, gdzie kończy poprzedni.</span>`;
        legsContainer.appendChild(info);

        lastRouteLegs.forEach((leg, idx) => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-block';
            btn.style.cssText = 'background-color:#4285F4;color:white;padding:11px;margin-bottom:8px;';
            btn.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> Etap ${idx + 1}: przystanki ${leg.from}–${leg.to} (${leg.count})`;
            btn.addEventListener('click', () => window.open(leg.url, '_blank'));
            legsContainer.appendChild(btn);
        });
    }

    function openCustomRouteInGoogleMaps() {
        const route = window.lastPlannedCustomRoute || customRouteList;
        if (!route || route.length === 0) {
            alert("Dodaj najpierw stacje do trasy!");
            return;
        }
        // Otwórz pierwszy etap (obsługuje limit 10 przystanków)
        const legs = buildGmapsLegs(route);
        if (legs.length === 0) {
            alert("Brak poprawnych współrzędnych w trasie.");
            return;
        }
        window.open(legs[0].url, '_blank');
        if (legs.length > 1) {
            showToast(`Otwarto etap 1 z ${legs.length}. Kolejne etapy są poniżej.`);
        }
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
        
        // Oznacz wybrane stacje jako "W trakcie" i zaktualizuj ich datę
        selected.forEach(st => {
            const stationInDb = stations.find(s => s.ID_Punktu === st.ID_Punktu);
            if (stationInDb && stationInDb.Status !== 'Zrobione') {
                stationInDb.Status = 'W trakcie';
                stationInDb.Ostatnia_Aktualizacja = getFormattedDate();
            }
        });
        
        customRouteList = [...selected];
        saveToLocalStorage();
        saveCustomRouteList();
        refreshUI();
        
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
            zoomControl: false, // Wyłączamy domyślne przyciski +/- z lewej góry (dodamy własne)
            doubleClickZoom: false // Podwójny klik służy do oznaczania stacji jako "zrobione"
        }).setView([gpsSimLocation.lat, gpsSimLocation.lon], 13);
        
        // Dodanie warstwy mapy OpenStreetMap (darmowe kafelki)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        // Dodanie przycisków zoom w prawym górnym rogu dla wygody
        L.control.zoom({ position: 'topright' }).addTo(map);

          // Inicjalizacja custom pane dla terytoriów (pozwala na gooey filter bez wpływania na marker i trasę)
          map.createPane('territory');
          map.getPane('territory').style.zIndex = 350;
          map.getPane('territory').classList.add('leaflet-territory-pane');

        
        // Leaflet Geocoder (wyszukiwarka miejscowości)
        if (L.Control.Geocoder) {
            const geocoder = L.Control.geocoder({
                defaultMarkGeocode: false,
                placeholder: 'Wyszukaj miejscowość, ulicę...'
            }).on('markgeocode', function(e) {
                const bbox = e.geocode.bbox;
                map.fitBounds(bbox);
                if (typeof handleGeocoderResult === 'function') {
                    handleGeocoderResult(e.geocode);
                }
            }).addTo(map);
        }
        
        // Inicjalizacja grupy klastrów markerów
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });
        map.addLayer(markerClusterGroup);
        
        // Inicjalizacja grupy warstw dla obszarów handlowców
        territoryLayerGroup = L.layerGroup().addTo(map);
        
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

    // Weryfikacja czy stacja jest aktualnie zajęta przez innego przedstawiciela
    function isStationOccupiedByOther(st) {
        if (!st || !st.Obecny_Handlowiec) return false;
        
        const currentLoggedUser = (currentUser || '').toLowerCase().trim();
        const occupyingUser = st.Obecny_Handlowiec.toLowerCase().trim();
        if (occupyingUser === currentLoggedUser) return false;

        // Sprawdzamy czy blokada nie wygasła (15 minut = 900 000 ms)
        const timestamp = parseInt(st.Obecny_Od);
        if (isNaN(timestamp)) return false;

        const elapsed = Date.now() - timestamp;
        return elapsed < 900000; // 15 minut
    }

    // Tworzenie/aktualizacja markerów na mapie (z użyciem klastrowania)
    
    
    function getFilteredStations() {
        return stations.filter(st => {
            // Filtrowanie niepoprawnych współrzędnych GPS
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) {
                return false;
            }

            // 1. Filtrowanie "Tylko moje stacje" - stacje przypisane do zalogowanego użytkownika
            if (rlsEnabled) {
                const stHandlowiec = (st.Handlowiec || '').toLowerCase().trim();
                const loggedUser = (currentUser || '').toLowerCase().trim();
                if (stHandlowiec !== loggedUser) {
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

            // 2. Filtrowanie statusu
            if (statusFilter) {
                const statusVal = statusFilter.value;
                if (statusVal !== 'all' && st.Status !== statusVal) {
                    return false;
                }
            }

            // 3. Filtrowanie po wyszukiwarce (np. nazwa, miasto, adres)
            if (searchInput && searchInput.value) {
                const q = searchInput.value.toLowerCase().trim();
                const name = (st.Nazwa_Stacji || '').toLowerCase();
                const city = (st.Miasto || '').toLowerCase();
                const addr = (st.Adres || '').toLowerCase();
                const id = (st.ID_Punktu || '').toLowerCase();
                
                if (!name.includes(q) && !city.includes(q) && !addr.includes(q) && !id.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }


    
    
    function updateMapMarkers() {
        if (!map) return;
        
        // Czyszczenie starych markerów
        if (markerClusterGroup) {
            map.removeLayer(markerClusterGroup);
        }
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 40,
            disableClusteringAtZoom: 14
        });

        // Czyszczenie starych stref (territoryPane)
        if (territoryLayerGroup) {
            map.removeLayer(territoryLayerGroup);
        }
        territoryLayerGroup = L.layerGroup().addTo(map);

        const filtered = getFilteredStations();
        
        const assignmentsStyles = {
            'rafal.kruk': { color: '#0066cc' },
            'waldemar.derejczyk': { color: '#ff3333' },
            'ireneusz.grzeda': { color: '#00cc66' },
            'bartosz.cugier': { color: '#cc00cc' }
        };

        filtered.forEach(st => {
            const lat = parseFloat(st.Latitude);
            const lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) return;
            
            // Rysowanie kółek handlowców w specjalnym panelu
            const stHandlowiec = (st.Handlowiec || '').toLowerCase().trim();
            let style = null;
            for (let key in assignmentsStyles) {
                if (stHandlowiec.includes(key)) {
                    style = assignmentsStyles[key];
                    break;
                }
            }

            if (style) {
                L.circleMarker([lat, lon], {
                    pane: 'territory',
                    radius: 18,
                    color: style.color,
                    weight: 0,
                    fillColor: style.color,
                    fillOpacity: 1.0,
                    interactive: false
                }).addTo(territoryLayerGroup);
            }

            // Stylizacja pinu w zależności od statusu
            let statusClass = 'pin-todo';
            if (st.Status === 'W trakcie') statusClass = 'pin-progress';
            else if (st.Status === 'Zrobione') statusClass = 'pin-done';
            const isMotorwayReview = (st.Notatki || '').includes('MOP/AUTOSTRADA - BRAK PEŁNEGO ADRESU');
            const isDuplicate = isMarkedDuplicate(st);
            if (isDuplicate && st.Status === 'Do zrobienia') statusClass = 'pin-duplicate';
            
            // Jeśli stacja wymaga pilnego audytu i nie jest jeszcze zrobiona, oznacz ją jako "urgent"
            let urgentClass = '';
            if (st.Audyt === 'Tak' && st.Status !== 'Zrobione') {
                urgentClass = 'pin-urgent';
            }
            
            // Sprawdzenie zajętości przez innego handlowca
            let occupiedClass = '';
            const isBusy = isStationOccupiedByOther(st);
            if (isBusy) {
                occupiedClass = 'pin-occupied';
            }
            
            const motorwayClass = isMotorwayReview ? 'pin-motorway' : '';
            let innerHtml = st.Audyt === 'Tak' ? '<span class="audit-exclamation">!</span>' : '';
            if (isMotorwayReview && !innerHtml) {
                innerHtml = '<span class="audit-exclamation">M</span>';
            }
            if (isBusy) {
                innerHtml = '<span class="audit-exclamation" style="color: white !important; font-weight: bold;">⚠️</span>';
            }
            
            const customIcon = L.divIcon({
                className: 'custom-leaflet-icon',
                html: `
                    <div class="custom-pin ${statusClass} ${urgentClass} ${motorwayClass} ${occupiedClass}">
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

            // Pojedynczy klik = szczegóły; podwójny klik = oznacz jako "zrobione" (zielony)
            marker.on('click', () => {
                if (marker._clickTimer) {
                    clearTimeout(marker._clickTimer);
                    marker._clickTimer = null;
                    return; // to druga część podwójnego kliknięcia – obsłuży dblclick
                }
                marker._clickTimer = setTimeout(() => {
                    marker._clickTimer = null;
                    openStationDetails(st);
                }, 260);
            });
            marker.on('dblclick', (e) => {
                if (e && e.originalEvent) {
                    L.DomEvent.stopPropagation(e);
                    L.DomEvent.preventDefault(e);
                }
                if (marker._clickTimer) { clearTimeout(marker._clickTimer); marker._clickTimer = null; }
                markStationDone(st);
            });

            markerClusterGroup.addLayer(marker);
            markers[st.ID_Punktu] = marker;
        });

        map.addLayer(markerClusterGroup);
    }


    
    function openStationDetails(station, isAutoDetected = false) {
        selectedStation = station;
        
        // Pokazywanie/ukrywanie alertu GPS geofencingu
        const geofenceAlert = document.getElementById('sheet-geofence-alert');
        if (geofenceAlert) {
            geofenceAlert.style.display = isAutoDetected ? 'flex' : 'none';
        }
        
        // Obsługa wykrywania czy ktoś inny jest na stacji
        const presenceBanner = document.getElementById('sheet-presence-banner');
        const presenceText = document.getElementById('sheet-presence-text');
        const isBusy = isStationOccupiedByOther(station);

        if (presenceBanner && presenceText) {
            if (isBusy) {
                let timeStr = "nieznana";
                if (station.Obecny_Od) {
                    try {
                        timeStr = new Date(parseInt(station.Obecny_Od)).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {}
                }
                presenceText.textContent = `Przedstawiciel ${station.Obecny_Handlowiec} jest teraz na tej stacji (od ${timeStr})!`;
                presenceBanner.style.display = 'flex';
                setBottomSheetDisabledState(true);
            } else {
                presenceBanner.style.display = 'none';
                setBottomSheetDisabledState(false);
                
                // Automatyczne zajęcie stacji przez obecnego użytkownika
                station.Obecny_Handlowiec = currentUser;
                station.Obecny_Od = Date.now().toString();
                saveToLocalStorage();
                updateMapMarkers();
            }
        }
        
        // Wypełnienie formularza danymi
        sheetStationId.textContent = station.ID_Punktu;
        sheetStationName.textContent = station.Nazwa_Stacji;
        sheetStationAddress.textContent = station.Adres;
        
        sheetStatusBadge.textContent = station.Status;
        sheetStatusBadge.setAttribute('data-status', station.Status);
        
        sheetAssigneeSelect.value = station.Handlowiec || "";
        if (sheetNotesInput) sheetNotesInput.value = station.Notatki || "";
        sheetUpdateTime.textContent = station.Ostatnia_Aktualizacja || "Brak";
        
        // Zaznaczenie odpowiedniego przycisku szybkiej akcji
        updateQuickActionButtonsActive(station.Status);
        
        // Uaktualnienie wyglądu przycisku dodawania do trasy
        updateBottomSheetRouteButton();
        updateDuplicateButtonState();
        
        // Pokaż arkusz i overlay
        bottomSheet.classList.add('open');
        if (overlay) overlay.classList.add('show');
    }


    // --- ODTWORZONE FUNKCJE PO CZYSZCZENIU REGEX ---

    function closeStationDetails() {
        if (!bottomSheet) return;
        bottomSheet.classList.remove('open');
        if (overlay) overlay.classList.remove('show');
        
        // Zwalnianie obecności przy zamknięciu formularza stacji
        if (selectedStation && selectedStation.Obecny_Handlowiec === currentUser) {
            delete selectedStation.Obecny_Handlowiec;
            delete selectedStation.Obecny_Od;
            saveToLocalStorage();
            updateMapMarkers();
        }
        
        selectedStation = null;
        
        const geofenceAlert = document.getElementById('sheet-geofence-alert');
        if (geofenceAlert) {
            geofenceAlert.style.display = 'none';
        }
        
        const presenceBanner = document.getElementById('sheet-presence-banner');
        if (presenceBanner) {
            presenceBanner.style.display = 'none';
        }
        
        if (typeof clearOSRMRoute === 'function') {
            clearOSRMRoute();
        }
        
        setBottomSheetDisabledState(false);
    }

    function setBottomSheetDisabledState(disabled) {
        const todoBtn = document.getElementById('action-todo-btn');
        const doneBtn = document.getElementById('action-done-btn');
        const assigneeSelect = document.getElementById('sheet-assignee-select');
        const toggleRouteBtn = document.getElementById('sheet-toggle-route-btn');
        const saveBtn = document.getElementById('sheet-save-btn');
        const duplicateBtn = document.getElementById('sheet-mark-duplicate-btn');
        
        if (todoBtn) todoBtn.disabled = disabled;
        if (doneBtn) doneBtn.disabled = disabled;
        if (assigneeSelect) assigneeSelect.disabled = disabled;
        if (toggleRouteBtn) toggleRouteBtn.disabled = disabled;
        if (saveBtn) saveBtn.disabled = disabled;
        if (duplicateBtn) duplicateBtn.disabled = disabled;
    }

    function updateQuickActionButtonsActive(status) {
        if (!actionTodoBtn || !actionProgressBtn || !actionDoneBtn) return;
        actionTodoBtn.classList.remove('active');
        actionProgressBtn.classList.remove('active');
        actionDoneBtn.classList.remove('active');
        
        if (status === 'Do zrobienia') actionTodoBtn.classList.add('active');
        else if (status === 'W trakcie') actionProgressBtn.classList.add('active');
        else if (status === 'Zrobione') actionDoneBtn.classList.add('active');
    }

    function updateSelectedStationStatus(status) {
        if (!selectedStation) return;
        const previousStatus = selectedStation.Status;
        selectedStation.Status = status;
        selectedStation.Ostatnia_Aktualizacja = getFormattedDate();
        
        updateQuickActionButtonsActive(status);
        if (sheetStatusBadge) {
            sheetStatusBadge.textContent = status;
            sheetStatusBadge.setAttribute('data-status', status);
        }
        
        saveToLocalStorage();
        updateMapMarkers();
        updateStationsListView();
        updateStats();
        
        if (status === 'Zrobione') {
            removeStationFromCustomRouteList(selectedStation.ID_Punktu);
        }
    }

    // Szybkie oznaczenie stacji jako "zrobione" (np. podwójny klik na mapie)
    function markStationDone(st) {
        if (!st) return;
        if (st.Status === 'Zrobione') {
            // Podwójny klik na już zrobionej – cofnij do "Do zrobienia"
            st.Status = 'Do zrobienia';
            st.Ostatnia_Aktualizacja = getFormattedDate();
            showToast(`${st.Nazwa_Stacji}: cofnięto na "Do zrobienia"`);
        } else {
            st.Status = 'Zrobione';
            st.Ostatnia_Aktualizacja = getFormattedDate();
            logCompletedVisit(st, 'mapa-2x');
            removeStationFromCustomRouteList(st.ID_Punktu);
            showToast(`${st.Nazwa_Stacji}: zrobione ✓`);
        }

        if (selectedStation && selectedStation.ID_Punktu === st.ID_Punktu) {
            selectedStation.Status = st.Status;
            updateQuickActionButtonsActive(st.Status);
            if (sheetStatusBadge) {
                sheetStatusBadge.textContent = st.Status;
                sheetStatusBadge.setAttribute('data-status', st.Status);
            }
        }

        saveToLocalStorage();
        updateMapMarkers();
        updateStats();
        updateStationsListView();
    }

    function checkSearchForRouteAlong(query) {
        const helperCard = document.getElementById('route-along-helper-card');
        const destNameEl = document.getElementById('route-along-destination-name');
        if (!helperCard || !destNameEl) return;
        
        const q = (query || '').toLowerCase().trim();
        if (q.length < 3) {
            helperCard.style.display = 'none';
            if (routeAlongPolyline && map) {
                map.removeLayer(routeAlongPolyline);
                routeAlongPolyline = null;
            }
            return;
        }
        
        const matchingSt = stations.find(st => {
            const city = (st.Miasto || '').toLowerCase();
            const addr = (st.Adres || '').toLowerCase();
            const name = (st.Nazwa_Stacji || '').toLowerCase();
            return city.includes(q) || addr.includes(q) || name.includes(q);
        });
        
        if (matchingSt) {
            const destLat = parseFloat(matchingSt.Latitude);
            const destLon = parseFloat(matchingSt.Longitude);
            const userLat = gpsSimLocation.lat;
            const userLon = gpsSimLocation.lon;
            
            if (isNaN(destLat) || isNaN(destLon)) {
                helperCard.style.display = 'none';
                return;
            }
            
            routeAlongStations = stations.filter(st => {
                const lat = parseFloat(st.Latitude);
                const lon = parseFloat(st.Longitude);
                if (isNaN(lat) || isNaN(lon)) return false;
                
                const distToSeg = getDistanceToSegment([lat, lon], [userLat, userLon], [destLat, destLon]);
                return distToSeg <= 0.08 && st.ID_Punktu !== matchingSt.ID_Punktu;
            });
            
            routeAlongStations.push(matchingSt);
            
            if (routeAlongStations.length > 1) {
                destNameEl.textContent = matchingSt.Miasto || matchingSt.Nazwa_Stacji;
                helperCard.style.display = 'block';
            } else {
                helperCard.style.display = 'none';
            }
        } else {
            helperCard.style.display = 'none';
        }
    }


    async function saveStationChanges() {
        if (!selectedStation) return;
        selectedStation.Handlowiec = sheetAssigneeSelect.value;
        selectedStation.Ostatnia_Aktualizacja = getFormattedDate();
        saveToLocalStorage();
        updateMapMarkers();
        updateStationsListView();
        updateStats();
        closeStationDetails();
        showToast("Zapisano zmiany pomyślnie!");
    }


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

        // Pokaż max 50 wyników by uniknąć zacięcia UI
        const limit = 50;
        const displayStations = filtered.slice(0, limit);
        
        if (filtered.length > limit) {
            const warningCard = document.createElement('div');
            warningCard.style.padding = '10px';
            warningCard.style.textAlign = 'center';
            warningCard.style.color = 'var(--primary)';
            warningCard.style.fontSize = '0.85rem';
            warningCard.innerHTML = `<i class="fa-solid fa-circle-info"></i> Pokazano ${limit} z ${filtered.length} najbliższych stacji. Użyj wyszukiwarki lub filtrów, aby zawęzić wyniki.`;
            stationsListContainer.appendChild(warningCard);
        }

        displayStations.forEach(st => {
            const card = document.createElement('div');
            card.className = 'station-card';
            
            // Nadaj odpowiednią klasę przypisania handlowca, aby dodać lewy pasek i tło
            const initialHandlowiecLower = (st.Handlowiec || '').toLowerCase().trim();
            if (initialHandlowiecLower.includes('rafal.kruk')) {
                card.classList.add('assigned-rafal');
            } else if (initialHandlowiecLower.includes('waldemar.derejczyk')) {
                card.classList.add('assigned-waldek');
            } else if (initialHandlowiecLower.includes('ireneusz.grzeda')) {
                card.classList.add('assigned-ireneusz');
            } else if (initialHandlowiecLower.includes('bartosz.cugier')) {
                card.classList.add('assigned-bartek');
            }
            
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
            const isMotorwayReview = (st.Notatki || '').includes('MOP/AUTOSTRADA - BRAK PEŁNEGO ADRESU');
            const isDuplicate = isMarkedDuplicate(st);
            if (st.Status === 'Do zrobienia') {
                if (isMotorwayReview) statusClass = 'motorway';
                else if (isDuplicate) statusClass = 'duplicate';
            }
            
            const auditBadgeHtml = st.Audyt === 'Tak' ? '<span class="audit-badge"><i class="fa-solid fa-triangle-exclamation"></i> PILNE</span>' : '';
            const motorwayBadgeHtml = isMotorwayReview ? '<span class="audit-badge motorway-badge"><i class="fa-solid fa-road"></i> MOP</span>' : '';
            const duplicateBadgeHtml = isDuplicate ? '<span class="audit-badge duplicate-badge"><i class="fa-solid fa-copy"></i> DUPLIKAT</span>' : '';
            // Sprawdzenie czy stacja jest na dzisiejszej trasie
            const isOnRoute = customRouteList.some(v => v.ID_Punktu === st.ID_Punktu);
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title-group">
                        <span class="station-id-label">${st.ID_Punktu}</span>
                        ${auditBadgeHtml}
                        ${motorwayBadgeHtml}
                        ${duplicateBadgeHtml}
                        <h4>${st.Nazwa_Stacji}</h4>
                    </div>
                    <button class="list-status-btn" title="Kliknij, aby zmienić status" style="display: flex; align-items: center; gap: 6px; background: var(--light); border: 1px solid var(--border); border-radius: 20px; padding: 4px 10px; cursor: pointer; font-family: var(--font); font-size: 0.72rem; font-weight: 600; color: var(--dark); white-space: nowrap;">
                        <span class="card-status-dot ${statusClass}" style="margin: 0;"></span>
                        <span class="list-status-text">${st.Status}</span>
                    </button>
                </div>
                <div class="card-address">${st.Adres}</div>
                
                <div style="margin-top: 10px; font-size: 0.8rem; color: var(--dark-muted); display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fa-solid fa-location-arrow"></i> ${distStr}</span>
                    <span class="card-assignee-text-hint">
                        Przypisany: ${st.Handlowiec ? st.Handlowiec.split('@')[0] : 'Nieprzypisany'}
                    </span>
                </div>

                <div class="card-actions" style="display: flex; gap: 8px; margin-top: 10px; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <select class="list-assignee-select" style="padding: 4px 6px; font-size: 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background-color: var(--white); cursor: pointer; max-width: 140px;">
                            <option value="">-- Nieprzypisany --</option>
                            <option value="waldemar.derejczyk@telforceone.pl">Waldek</option>
                            <option value="bartosz.cugier@telforceone.pl">Bartek</option>
                            <option value="rafal.kruk@telforceone.pl">Rafał</option>
                            <option value="ireneusz.grzeda@telforceone.pl">Ireneusz</option>
                        </select>
                    </div>
                    <button class="list-toggle-route-btn btn ${isOnRoute ? 'btn-success' : 'btn-secondary'} btn-sm" style="padding: 4px 10px; font-size: 0.8rem; border-radius: var(--radius-sm); box-shadow: none;">
                        ${isOnRoute ? '<i class="fa-solid fa-check"></i> Na trasie' : '<i class="fa-solid fa-plus"></i> Dodaj do trasy'}
                    </button>
                </div>
            `;
            
            // Konfiguracja selecta i przycisku z zatrzymaniem propagacji kliknięć
            const selectEl = card.querySelector('.list-assignee-select');
            selectEl.value = st.Handlowiec || "";
            selectEl.addEventListener('click', (e) => e.stopPropagation());
            selectEl.addEventListener('change', (e) => {
                e.stopPropagation();
                st.Handlowiec = selectEl.value;
                st.Ostatnia_Aktualizacja = getFormattedDate();
                
                // Zaktualizuj klasy karty dla koloru tła i obramowania handlowca
                card.classList.remove('assigned-rafal', 'assigned-waldek', 'assigned-ireneusz', 'assigned-bartek');
                const newHandlowiecLower = (st.Handlowiec || '').toLowerCase().trim();
                if (newHandlowiecLower.includes('rafal.kruk')) {
                    card.classList.add('assigned-rafal');
                } else if (newHandlowiecLower.includes('waldemar.derejczyk')) {
                    card.classList.add('assigned-waldek');
                } else if (newHandlowiecLower.includes('ireneusz.grzeda')) {
                    card.classList.add('assigned-ireneusz');
                } else if (newHandlowiecLower.includes('bartosz.cugier')) {
                    card.classList.add('assigned-bartek');
                }
                
                // Zaktualizuj tekst podpowiedzi przypisania
                const assigneeTextHint = card.querySelector('.card-assignee-text-hint');
                if (assigneeTextHint) {
                    assigneeTextHint.textContent = `Przypisany: ${st.Handlowiec ? st.Handlowiec.split('@')[0] : 'Nieprzypisany'}`;
                }
                
                saveToLocalStorage();
                updateMapMarkers(); // Przelicz markery i Convex Hull na mapie
                showToast(`Stacja ${st.Nazwa_Stacji}: zaktualizowano przypisanie handlowca.`);
            });

            // Klikalny status – cykl: Do zrobienia → W trakcie → Zrobione
            const statusBtn = card.querySelector('.list-status-btn');
            if (statusBtn) {
                statusBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cycle = ['Do zrobienia', 'W trakcie', 'Zrobione'];
                    const nextStatus = cycle[(cycle.indexOf(st.Status) + 1) % cycle.length];
                    st.Status = nextStatus;
                    st.Ostatnia_Aktualizacja = getFormattedDate();

                    // Aktualizacja koloru kropki i tekstu w karcie
                    let cls = 'todo';
                    if (nextStatus === 'W trakcie') cls = 'progress';
                    else if (nextStatus === 'Zrobione') cls = 'done';
                    const dot = statusBtn.querySelector('.card-status-dot');
                    if (dot) dot.className = `card-status-dot ${cls}`;
                    dot.style.margin = '0';
                    const txt = statusBtn.querySelector('.list-status-text');
                    if (txt) txt.textContent = nextStatus;

                    if (nextStatus === 'Zrobione') {
                        logCompletedVisit(st, 'lista');
                        removeStationFromCustomRouteList(st.ID_Punktu);
                    }

                    saveToLocalStorage();
                    updateMapMarkers();
                    updateStats();
                    showToast(`${st.Nazwa_Stacji}: ${nextStatus}`);
                });
            }

            const btnEl = card.querySelector('.list-toggle-route-btn');
            btnEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = customRouteList.findIndex(v => v.ID_Punktu === st.ID_Punktu);
                if (idx !== -1) {
                    removeStationFromCustomRouteList(st.ID_Punktu);
                    btnEl.className = 'list-toggle-route-btn btn btn-secondary btn-sm';
                    btnEl.innerHTML = '<i class="fa-solid fa-plus"></i> Dodaj do trasy';
                    showToast(`Usunięto stację ${st.Nazwa_Stacji} z trasy.`);
                } else {
                    addStationToCustomRouteList(st);
                    btnEl.className = 'list-toggle-route-btn btn btn-success btn-sm';
                    btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Na trasie';
                    showToast(`Dodano stację ${st.Nazwa_Stacji} do trasy.`);
                }
                saveToLocalStorage();
                updateMapMarkers();
                updateStats();
            });
            
            // Kliknięcie w kartę na liście:
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

    // ==========================================================================
    // FUNKCJE RDZENIA (odtworzone) – narzędzia, statystyki, zdarzenia, CSV, GPS
    // ==========================================================================

    let toastTimeoutId = null;
    function showToast(message) {
        const toastEl = document.getElementById('toast');
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (toastTimeoutId) clearTimeout(toastTimeoutId);
        toastTimeoutId = setTimeout(() => toastEl.classList.remove('show'), 3000);
    }

    // Odległość po powierzchni Ziemi (Haversine) w kilometrach
    function calculateDistance(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some(v => v === undefined || v === null || isNaN(v))) {
            return Infinity;
        }
        const R = 6371; // promień Ziemi w km
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Odległość (km) punktu od odcinka [start, end] – używane do "stacji po drodze"
    function getDistanceToSegment(point, segStart, segEnd) {
        const cosLat = Math.cos(point[0] * Math.PI / 180);
        const toXY = ([la, lo]) => [lo * 111.32 * cosLat, la * 110.57];
        const p = toXY(point), a = toXY(segStart), b = toXY(segEnd);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }

    // Data w formacie "RRRR-MM-DD GG:MM:SS"
    function getFormattedDate() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    // Przełączanie zakładek (dolna nawigacja)
    function switchToTab(tabId) {
        currentTab = tabId;
        tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === tabId));
        navItems.forEach(item => item.classList.toggle('active', item.getAttribute('data-tab') === tabId));

        if (tabId === 'tab-map' && map) {
            setTimeout(() => map.invalidateSize(), 120);
        }
        if (tabId === 'tab-list') updateStationsListView();
        if (tabId === 'tab-route') {
            updateCustomRouteUI();
            updateCompletedVisitsHistoryUI();
        }
    }

    // Aktualizacja licznika "zrobione / wszystkie" w nagłówku
    function updateStats() {
        const filtered = getFilteredStations();
        const total = filtered.length;
        const done = filtered.filter(st => st.Status === 'Zrobione').length;
        const counter = document.getElementById('stats-counter');
        if (!counter) return;
        const doneEl = counter.querySelector('.done-count');
        const totalEl = counter.querySelector('.total-count');
        if (doneEl) doneEl.textContent = done;
        if (totalEl) totalEl.textContent = total;
    }

    // Pełne odświeżenie widoków po zmianie danych/filtrów
    function refreshUI() {
        updateMapMarkers();
        updateStationsListView();
        updateStats();
        updateCustomRouteUI();
    }

    // Dodanie stacji do dzisiejszej trasy (bez duplikatów) i oznaczenie "W trakcie"
    function addStationToCustomRouteList(station) {
        if (!station) return;
        if (customRouteList.some(s => s.ID_Punktu === station.ID_Punktu)) return;
        const stationInDb = stations.find(s => s.ID_Punktu === station.ID_Punktu) || station;
        customRouteList.push(stationInDb);
        if (stationInDb.Status !== 'Zrobione') {
            stationInDb.Status = 'W trakcie';
            stationInDb.Ostatnia_Aktualizacja = getFormattedDate();
        }
        saveCustomRouteList();
    }

    // Sugerowane wizyty – stacje w promieniu 200 m od pozycji GPS
    function loadSuggestedVisits() {
        const listEl = document.getElementById('suggested-visits-list');
        if (!listEl) return;
        suggestedVisits = stations.filter(st => {
            if (st.Status === 'Zrobione') return false;
            const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
            if (isNaN(lat) || isNaN(lon)) return false;
            return calculateDistance(gpsSimLocation.lat, gpsSimLocation.lon, lat, lon) <= 0.2;
        }).slice(0, 5);

        if (!suggestedVisits.length) {
            listEl.innerHTML = '<li style="list-style:none;font-size:0.8rem;color:var(--dark-muted);text-align:center;padding:12px 0;">Brak stacji w promieniu 200 m.</li>';
            return;
        }
        listEl.innerHTML = '';
        suggestedVisits.forEach(st => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
                    <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${st.Nazwa_Stacji}</strong>
                    <span style="font-size:0.7rem;color:var(--dark-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(st.Adres || '').split(',')[0]}</span>
                </div>`;
            li.addEventListener('click', () => {
                switchToTab('tab-map');
                const lat = parseFloat(st.Latitude), lon = parseFloat(st.Longitude);
                if (map && !isNaN(lat) && !isNaN(lon)) map.setView([lat, lon], 15);
                setTimeout(() => openStationDetails(st), 300);
            });
            listEl.appendChild(li);
        });
    }

    // Geofencing – wykrycie najbliższej stacji (<=100 m) i pokazanie banera
    function checkGeofencing(lat, lon) {
        if (!stations.length) return;
        let nearest = null, nearestDist = Infinity;
        stations.forEach(st => {
            if (st.Status === 'Zrobione') return;
            const slat = parseFloat(st.Latitude), slon = parseFloat(st.Longitude);
            if (isNaN(slat) || isNaN(slon)) return;
            const d = calculateDistance(lat, lon, slat, slon);
            if (d < nearestDist) { nearestDist = d; nearest = st; }
        });

        const banner = document.getElementById('proximity-alert-banner');
        const textEl = document.getElementById('proximity-alert-text');
        if (nearest && nearestDist <= 0.1 && !notifiedStations.has(nearest.ID_Punktu)) {
            proximityActiveStation = nearest;
            notifiedStations.add(nearest.ID_Punktu);
            if (banner && textEl) {
                textEl.textContent = `Czy byłeś na stacji ${nearest.Nazwa_Stacji}?`;
                banner.style.display = 'flex';
            }
            if (window.Notification && Notification.permission === 'granted') {
                try { new Notification('Stacja Orlen w pobliżu', { body: nearest.Nazwa_Stacji }); } catch (e) {}
            }
        }
        loadSuggestedVisits();
    }

    // Wyczyszczenie linii trasy (realna trasa po drogach + "po drodze")
    function clearOSRMRoute() {
        if (roadRouteLayer && map) { map.removeLayer(roadRouteLayer); roadRouteLayer = null; }
        if (roadRouteCasingLayer && map) { map.removeLayer(roadRouteCasingLayer); roadRouteCasingLayer = null; }
        if (routeAlongPolyline && map) { map.removeLayer(routeAlongPolyline); routeAlongPolyline = null; }
    }

    // Obsługa wyniku geokodera (wyszukanie miejscowości) – prompt "stacje po drodze"
    function handleGeocoderResult(geocode) {
        const promptEl = document.getElementById('route-along-prompt');
        const destEl = document.getElementById('route-prompt-dest');
        if (destEl) destEl.textContent = (geocode && geocode.name) ? geocode.name.split(',')[0] : 'Wybrany cel';
        if (promptEl) promptEl.style.display = 'flex';
    }

    // ==========================================================================
    // OBSŁUGA CSV (eksport / import)
    // ==========================================================================
    const CSV_COLUMNS = ['ID_Punktu', 'Nazwa_Stacji', 'Adres', 'Latitude', 'Longitude', 'Handlowiec', 'Status', 'Ostatnia_Aktualizacja', 'Notatki', 'Audyt'];

    function csvEscape(val) {
        const s = String(val === undefined || val === null ? '' : val);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function parseCSVLine(line) {
        const result = [];
        let cur = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (line[i + 1] === '"') { cur += '"'; i++; }
                    else inQuotes = false;
                } else cur += ch;
            } else {
                if (ch === '"') inQuotes = true;
                else if (ch === ',') { result.push(cur); cur = ''; }
                else cur += ch;
            }
        }
        result.push(cur);
        return result;
    }

    function exportToCSV() {
        const lines = [CSV_COLUMNS.join(',')];
        stations.forEach(st => lines.push(CSV_COLUMNS.map(c => csvEscape(st[c])).join(',')));
        const csv = '﻿' + lines.join('\r\n'); // BOM dla polskich znaków w Excelu
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stacje_orlen.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Wyeksportowano ${stations.length} stacji do stacje_orlen.csv`);
    }

    function handleCSVImport(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let text = e.target.result;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const rows = text.split(/\r?\n/).filter(r => r.trim().length);
                if (rows.length < 2) { alert('Plik CSV jest pusty lub niepoprawny.'); return; }
                const header = parseCSVLine(rows[0]).map(h => h.trim());
                const imported = [];
                for (let i = 1; i < rows.length; i++) {
                    const vals = parseCSVLine(rows[i]);
                    const obj = {};
                    header.forEach((h, idx) => { obj[h] = vals[idx] !== undefined ? vals[idx] : ''; });
                    if (obj.ID_Punktu) imported.push(obj);
                }
                if (!imported.length) { alert('Plik CSV nie zawiera poprawnych rekordów (brak ID_Punktu).'); return; }
                stations = imported;
                mockAssignSalespeople(stations);
                saveToLocalStorage();
                loadCustomRouteList();
                refreshUI();
                showToast(`Zaimportowano ${imported.length} stacji z pliku CSV.`);
            } catch (err) {
                console.error('Błąd importu CSV:', err);
                alert('Błąd importu CSV: ' + err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    // Pokazanie/ukrycie przycisku czyszczenia filtrów listy
    function toggleResetListFiltersBtn() {
        if (!resetListFiltersBtn) return;
        const active = (searchInputOld && searchInputOld.value.trim()) || (statusFilter && statusFilter.value !== 'all');
        resetListFiltersBtn.style.display = active ? 'block' : 'none';
    }

    // ==========================================================================
    // INICJALIZACJA ZDARZEŃ (event listeners)
    // ==========================================================================
    function initEvents() {
        // --- Dolna nawigacja (zakładki) ---
        navItems.forEach(item => {
            item.addEventListener('click', () => switchToTab(item.getAttribute('data-tab')));
        });

        // --- Przełącznik "Tylko moje" (nagłówek + ustawienia, synchronizowane) ---
        const rlsToggles = document.querySelectorAll('#rls-toggle, #rls-toggle-settings');
        rlsToggles.forEach(el => el.addEventListener('change', (e) => {
            rlsEnabled = e.target.checked;
            rlsToggles.forEach(o => { o.checked = rlsEnabled; });
            refreshUI();
        }));

        // --- Przełącznik "Tylko pilne" (nagłówek + ustawienia, synchronizowane) ---
        const urgentToggles = document.querySelectorAll('#urgent-only-toggle, #urgent-only-toggle-settings');
        urgentToggles.forEach(el => el.addEventListener('change', (e) => {
            urgentToggles.forEach(o => { o.checked = e.target.checked; });
            refreshUI();
        }));

        // --- Wybór zalogowanego użytkownika ---
        if (userSelect) userSelect.addEventListener('change', (e) => {
            currentUser = e.target.value;
            refreshUI();
            showToast(`Zalogowano jako ${currentUser.split('@')[0]}`);
        });

        // --- Wyszukiwarka na mapie (Google-style) ---
        if (searchInput) {
            let searchZoomTimer = null;
            searchInput.addEventListener('input', () => {
                updateMapMarkers();
                updateStats();
                // Na bieżąco pokaż na mapie stacje pasujące (np. w Lesznie) – zanim zatwierdzisz
                if (searchZoomTimer) clearTimeout(searchZoomTimer);
                searchZoomTimer = setTimeout(() => {
                    const q = searchInput.value.trim();
                    if (q.length >= 3 && map) {
                        const matches = findStationsMatchingQuery(q);
                        if (matches.length) {
                            const b = L.latLngBounds(matches
                                .map(s => [parseFloat(s.Latitude), parseFloat(s.Longitude)])
                                .filter(c => !isNaN(c[0]) && !isNaN(c[1])));
                            if (b.isValid()) map.fitBounds(b.pad(0.3), { maxZoom: 13 });
                        }
                    }
                }, 500);
            });
            // Enter = pokaż okno "trasa po drodze do miasta"
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = searchInput.value.trim();
                    if (q.length >= 2) showRouteToCityPrompt(q);
                }
            });
        }

        // --- Pasek planowania trasy do miasta (na mapie) ---
        const rpStart = document.getElementById('route-plan-start');
        if (rpStart) rpStart.addEventListener('click', () => openCustomRouteInGoogleMaps());
        const rpAddAll = document.getElementById('route-plan-addall');
        if (rpAddAll) rpAddAll.addEventListener('click', () => addAllCandidatesToRoute());
        const rpCancel = document.getElementById('route-plan-cancel');
        if (rpCancel) rpCancel.addEventListener('click', () => {
            endRoutePlanning();
            showToast('Anulowano planowanie trasy.');
        });

        // --- Wyszukiwarka na liście (synchronizowana z filtrem mapy) ---
        if (searchInputOld) searchInputOld.addEventListener('input', () => {
            if (searchInput) searchInput.value = searchInputOld.value;
            updateStationsListView();
            if (clearSearchBtn) clearSearchBtn.style.display = searchInputOld.value ? 'flex' : 'none';
            toggleResetListFiltersBtn();
        });
        if (clearSearchBtn) clearSearchBtn.addEventListener('click', () => {
            if (searchInputOld) searchInputOld.value = '';
            if (searchInput) searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            refreshUI();
            toggleResetListFiltersBtn();
        });
        if (statusFilter) statusFilter.addEventListener('change', () => {
            updateStationsListView();
            updateMapMarkers();
            updateStats();
            toggleResetListFiltersBtn();
        });
        if (resetListFiltersBtn) resetListFiltersBtn.addEventListener('click', () => {
            if (searchInputOld) searchInputOld.value = '';
            if (searchInput) searchInput.value = '';
            if (statusFilter) statusFilter.value = 'all';
            if (clearSearchBtn) clearSearchBtn.style.display = 'none';
            refreshUI();
            toggleResetListFiltersBtn();
        });

        // --- Przyciski pływające na mapie ---
        if (recenterBtn) recenterBtn.addEventListener('click', () => {
            if (map) {
                map.setView([gpsSimLocation.lat, gpsSimLocation.lon], 15);
                updateUserLocationMarker();
            }
        });
        const mapRouteBtn = document.getElementById('map-route-planner-btn');
        if (mapRouteBtn) mapRouteBtn.addEventListener('click', () => switchToTab('tab-route'));

        // --- Bottom Sheet: zamykanie ---
        if (sheetCloseBtn) sheetCloseBtn.addEventListener('click', closeStationDetails);
        if (overlay) overlay.addEventListener('click', closeStationDetails);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStationDetails(); });

        // --- Bottom Sheet: szybkie akcje statusu ---
        if (actionTodoBtn) actionTodoBtn.addEventListener('click', () => updateSelectedStationStatus('Do zrobienia'));
        if (actionProgressBtn) actionProgressBtn.addEventListener('click', () => updateSelectedStationStatus('W trakcie'));
        if (actionDoneBtn) actionDoneBtn.addEventListener('click', () => {
            updateSelectedStationStatus('Zrobione');
            if (selectedStation) logCompletedVisit(selectedStation, 'manual');
        });

        // --- Bottom Sheet: zapis, duplikat, przypisanie, trasa, nawigacja ---
        if (sheetSaveBtn) sheetSaveBtn.addEventListener('click', saveStationChanges);
        if (sheetMarkDuplicateBtn) sheetMarkDuplicateBtn.addEventListener('click', toggleDuplicateMarkForSelectedStation);
        if (sheetAssigneeSelect) sheetAssigneeSelect.addEventListener('change', () => {
            if (selectedStation) selectedStation.Handlowiec = sheetAssigneeSelect.value;
        });
        const sheetToggleRouteBtn = document.getElementById('sheet-toggle-route-btn');
        if (sheetToggleRouteBtn) sheetToggleRouteBtn.addEventListener('click', () => {
            if (selectedStation) toggleCustomRoute(selectedStation);
        });
        const sheetNavigateBtn = document.getElementById('sheet-navigate-btn');
        if (sheetNavigateBtn) sheetNavigateBtn.addEventListener('click', () => {
            if (!selectedStation) return;
            const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${gpsSimLocation.lat},${gpsSimLocation.lon}&destination=${selectedStation.Latitude},${selectedStation.Longitude}`;
            window.open(url, '_blank');
        });

        // --- Planer trasy (ręczna lista) ---
        const planBtn = document.getElementById('route-custom-plan-btn');
        if (planBtn) planBtn.addEventListener('click', () => planCustomRoute());
        const clearRouteBtn = document.getElementById('route-custom-clear-btn');
        if (clearRouteBtn) clearRouteBtn.addEventListener('click', () => {
            [...customRouteList].forEach(st => setStatusAfterRouteRemoval(st.ID_Punktu));
            customRouteList = [];
            saveCustomRouteList();
            saveToLocalStorage();
            const results = document.getElementById('route-custom-results');
            if (results) results.style.display = 'none';
            const legs = document.getElementById('route-custom-gmaps-legs');
            if (legs) legs.innerHTML = '';
            clearOSRMRoute();
            window.lastPlannedCustomRoute = null;
            refreshUI();
            showToast('Wyczyszczono listę trasy.');
        });
        const gmapsBtn = document.getElementById('route-custom-open-gmaps-btn');
        if (gmapsBtn) gmapsBtn.addEventListener('click', openCustomRouteInGoogleMaps);
        const autoPlanBtn = document.getElementById('route-auto-plan-btn');
        if (autoPlanBtn) autoPlanBtn.addEventListener('click', generateAutoRouteInTab);
        const showOnMapBtn = document.getElementById('route-custom-show-on-map-btn');
        if (showOnMapBtn) showOnMapBtn.addEventListener('click', () => {
            switchToTab('tab-map');
            const layer = roadRouteLayer || routeAlongPolyline;
            if (map && layer && layer.getBounds && layer.getBounds().isValid()) {
                map.fitBounds(layer.getBounds().pad(0.12));
            } else if (window.lastPlannedCustomRoute && window.lastPlannedCustomRoute.length) {
                drawRoadRoute(window.lastPlannedCustomRoute);
            }
        });

        // --- Historia wykonanych tras ---
        const historyToggle = document.getElementById('history-toggle-btn');
        if (historyToggle) historyToggle.addEventListener('click', () => {
            const c = document.getElementById('history-container');
            if (!c) return;
            const show = c.style.display === 'none';
            c.style.display = show ? 'block' : 'none';
            historyToggle.innerHTML = show
                ? '<i class="fa-solid fa-eye-slash"></i> Ukryj historię'
                : '<i class="fa-solid fa-eye"></i> Pokaż historię';
            if (show) updateCompletedVisitsHistoryUI();
        });

        // --- Zarządzanie CSV ---
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
        if (importCsvFile) importCsvFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleCSVImport(e.target.files[0]);
                e.target.value = '';
            }
        });

        // --- Narzędzia: synchronizacja OSM, czyszczenie, reset ---
        if (syncOsmBtn) syncOsmBtn.addEventListener('click', syncStationsFromOSM);
        if (clearAssignmentsBtn) clearAssignmentsBtn.addEventListener('click', () => {
            if (!confirm('Usunąć przypisania handlowców ze wszystkich stacji?')) return;
            stations.forEach(st => { st.Handlowiec = ''; });
            saveToLocalStorage();
            refreshUI();
            showToast('Wyczyszczono przypisania handlowców.');
        });
        if (resetDbBtn) resetDbBtn.addEventListener('click', async () => {
            if (!confirm('Zresetować aplikację? Przywróci to domyślną bazę i wyczyści zmiany lokalne.')) return;
            localStorage.removeItem('orlen_crm_stations');
            localStorage.removeItem('orlen_custom_route');
            localStorage.removeItem('orlen_completed_visits_history');
            customRouteList = [];
            completedVisitsHistory = [];
            notifiedStations = new Set();
            await loadFromJSON();
            loadCustomRouteList();
            loadCompletedVisitsHistory();
            refreshUI();
            showToast('Zresetowano aplikację do stanu domyślnego.');
        });

        // --- Baner "stacja w pobliżu" (proximity) ---
        const proxBanner = document.getElementById('proximity-alert-banner');
        const proxYes = document.getElementById('proximity-btn-yes');
        const proxNo = document.getElementById('proximity-btn-no');
        if (proxYes) proxYes.addEventListener('click', () => {
            if (proxBanner) proxBanner.style.display = 'none';
            if (proximityActiveStation) {
                switchToTab('tab-map');
                openStationDetails(proximityActiveStation, true);
            }
        });
        if (proxNo) proxNo.addEventListener('click', () => {
            if (proxBanner) proxBanner.style.display = 'none';
        });

        // --- Pomocnik "stacje po drodze" ---
        const raHide = document.getElementById('route-along-hide-btn');
        if (raHide) raHide.addEventListener('click', () => {
            const c = document.getElementById('route-along-helper-card');
            if (c) c.style.display = 'none';
            clearOSRMRoute();
        });
        const raAddAll = document.getElementById('route-along-add-all-btn');
        if (raAddAll) raAddAll.addEventListener('click', () => {
            const count = routeAlongStations.length;
            routeAlongStations.forEach(st => addStationToCustomRouteList(st));
            refreshUI();
            showToast(`Dodano ${count} stacji po drodze do trasy.`);
            switchToTab('tab-route');
        });
        const raShow = document.getElementById('route-along-show-btn');
        if (raShow) raShow.addEventListener('click', () => {
            switchToTab('tab-map');
            if (map && routeAlongStations.length) {
                const b = L.latLngBounds(routeAlongStations
                    .map(s => [parseFloat(s.Latitude), parseFloat(s.Longitude)])
                    .filter(c => !isNaN(c[0]) && !isNaN(c[1])));
                if (b.isValid()) map.fitBounds(b.pad(0.2));
            }
        });

        // --- Prompt "cel wyszukiwania" (route-along) ---
        const rpClose = document.getElementById('route-prompt-close');
        if (rpClose) rpClose.addEventListener('click', () => {
            const p = document.getElementById('route-along-prompt');
            if (p) p.style.display = 'none';
        });
        const rpTodo = document.getElementById('route-prompt-todo');
        if (rpTodo) rpTodo.addEventListener('click', () => planRouteToCity(pendingRouteQuery, { onlyAudit: false }));
        const rpAudit = document.getElementById('route-prompt-audit');
        if (rpAudit) rpAudit.addEventListener('click', () => planRouteToCity(pendingRouteQuery, { onlyAudit: true }));
        const rpDirect = document.getElementById('route-prompt-direct');
        if (rpDirect) rpDirect.addEventListener('click', () => navigateDirectToCity(pendingRouteQuery));

        // Stan początkowy filtrów listy
        toggleResetListFiltersBtn();
    }

});
