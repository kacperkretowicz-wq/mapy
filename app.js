/* ==========================================================================
   Logika Biznesowa - System CRM z Mapą dla Handlowców Orlen (SFA)
   Wsparcie dla Leaflet.js, GPS, localStorage, RLS, CSV
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // STAN APLIKACJI (STATE)
    // ==========================================================================
    let stations = [];
    let currentUser = 'jan.kowalski@firma.pl';
    let rlsEnabled = true;
    let selectedStation = null;
    let currentTab = 'tab-map';
    let map = null;
    let markers = {}; // Słownik id_punktu -> marker Leaflet
    let userLocationMarker = null; // Marker aktualnej pozycji użytkownika
    let gpsWatchId = null; // ID ciągłego śledzenia GPS urządzenia
    let lastAutoOpenedStationId = null; // Zabezpieczenie przed zapętleniem autodetekcji
    
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
    const statsCounter = document.getElementById('stats-counter');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const statusFilter = document.getElementById('status-filter');
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
        // 1. Załaduj bazę danych (localStorage lub plik JSON lub fallback)
        await loadDatabase();
        
        // 2. Zainicjalizuj Mapę
        initMap();
        
        // 3. Zainicjalizuj zdarzenia i filtry
        initEvents();
        
        // 4. Odśwież widoki i liczniki
        refreshUI();
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
                return;
            } catch (e) {
                console.error("Błąd parsowania localStorage, ładuję domyślne", e);
            }
        }
        
        // Próba wczytania wygenerowanego JSON z serwera
        try {
            const response = await fetch('stacje_orlen.json');
            if (response.ok) {
                const fetchedData = await response.json();
                if (fetchedData && fetchedData.length > 0) {
                    stations = fetchedData;
                    // Przypiszmy na start kilku handlowców, aby RLS działał atrakcyjnie
                    mockAssignSalespeople(stations);
                    saveToLocalStorage();
                    console.log("Dane pobrane ze stacje_orlen.json (ilość:", stations.length, ")");
                    showToast("Wczytano bazę stacji z pliku JSON");
                    return;
                }
            }
        } catch (e) {
            console.log("Brak możliwości pobrania JSON (prawdopodobnie file:// lub offline). Ładuję fallback.");
        }
        
        // Ostateczny fallback (działa bezpośrednio przy dwukrotnym kliknięciu w index.html)
        stations = [...fallbackStations];
        saveToLocalStorage();
        console.log("Załadowano wbudowaną bazę fallback (ilość:", stations.length, ")");
    }

    function saveToLocalStorage() {
        localStorage.setItem('orlen_crm_stations', JSON.stringify(stations));
    }

    // Pomocnicze przypisanie handlowców do pustej bazy
    function mockAssignSalespeople(data) {
        const users = ['jan.kowalski@firma.pl', 'anna.nowak@firma.pl', 'tomasz.wisniewski@firma.pl'];
        data.forEach((st, index) => {
            // Co 3 stację przypisujemy do kogoś, a niektóre zostawiamy puste
            if (index % 4 === 0) {
                st.Handlowiec = users[0];
            } else if (index % 4 === 1) {
                st.Handlowiec = users[1];
            } else if (index % 4 === 2) {
                st.Handlowiec = users[2];
            } else {
                st.Handlowiec = ''; // nieprzypisana
            }
            
            // Trochę losowych statusów do testów
            if (index % 10 === 3) {
                st.Status = 'W trakcie';
                st.Ostatnia_Aktualizacja = getFormattedDate();
            } else if (index % 10 === 7) {
                st.Status = 'Zrobione';
                st.Ostatnia_Aktualizacja = getFormattedDate();
            } else {
                st.Status = 'Do zrobienia';
            }
        });
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

    // Tworzenie/aktualizacja markerów na mapie
    function updateMapMarkers() {
        if (!map) return;
        
        // Usunięcie starych markerów
        Object.keys(markers).forEach(id => {
            map.removeLayer(markers[id]);
        });
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
            
            const customIcon = L.divIcon({
                className: 'custom-leaflet-icon',
                html: `
                    <div class="custom-pin ${statusClass}">
                        <div class="pin-shadow"></div>
                        <div class="pin-body">
                            <div class="pin-inner"></div>
                        </div>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 32], // Stopka pinu dotyka punktu na mapie
                popupAnchor: [0, -32]
            });
            
            const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
            
            // Kliknięcie w marker otwiera Bottom Sheet
            marker.on('click', () => {
                openStationDetails(st);
            });
            
            markers[st.ID_Punktu] = marker;
        });
    }

    // ==========================================================================
    // REGUŁY FILTROWANIA I POZYSKIWANIA DANYCH (RLS + Wyszukiwarka)
    // ==========================================================================
    function getFilteredStations() {
        return stations.filter(st => {
            // 1. Zabezpieczenie danych (RLS) - tylko przypisane do mnie
            if (rlsEnabled && currentUser !== 'all') {
                if (st.Handlowiec !== currentUser) {
                    return false;
                }
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
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title-group">
                        <span class="station-id-label">${st.ID_Punktu}</span>
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
        // Wszystkie stacje widoczne dla danego użytkownika
        const myStations = stations.filter(st => {
            if (currentUser === 'all') return true;
            return st.Handlowiec === currentUser;
        });
        
        const done = myStations.filter(st => st.Status === 'Zrobione').length;
        
        // Zaktualizuj nagłówek
        document.querySelector('.done-count').textContent = done;
        document.querySelector('.total-count').textContent = myStations.length;
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
                Handlowiec: empIdx !== -1 ? line[empIdx] : '',
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
        
        // Zmiana zalogowanego handlowca
        userSelect.addEventListener('change', (e) => {
            currentUser = e.target.value;
            updateMapMarkers();
            updateStationsListView();
            updateStats();
            showToast(`Przełączono na użytkownika: ${currentUser.split('@')[0]}`);
        });
        
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
        
        // Wybór lokalizacji GPS (symulacja)
        gpsSimSelect.addEventListener('change', (e) => {
            handleGpsLocationChange(e.target.value);
        });
        
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
        
        // Synchronizacja OSM
        if (syncOsmBtn) {
            syncOsmBtn.addEventListener('click', syncOsmData);
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

    // Automatyczne wykrywanie obecności na stacji (geofencing)
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
    }

    // Obsługa zmiany symulowanego GPS
    function handleGpsLocationChange(val) {
        const coords = {
            "warszawa": { lat: 52.219500, lon: 20.965400, name: "Warszawa" },
            "wroclaw": { lat: 51.119421, lon: 16.992144, name: "Wrocław" },
            "krakow": { lat: 50.089800, lon: 19.934500, name: "Kraków" },
            "gdansk": { lat: 54.401200, lon: 18.571200, name: "Gdańsk" },
            "poznan": { lat: 52.365400, lon: 16.854100, name: "Poznań" }
        };
        
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
                        gpsSimSelect.value = 'wroclaw';
                        handleGpsLocationChange('wroclaw');
                    }
                );
            } else {
                alert("Twoje urządzenie nie wspiera geolokalizacji. Wybierz miasto do symulacji.");
                gpsSimSelect.value = 'wroclaw';
                handleGpsLocationChange('wroclaw');
            }
        } else if (coords[val]) {
            const loc = coords[val];
            gpsSimLocation.lat = loc.lat;
            gpsSimLocation.lon = loc.lon;
            gpsCoordsText.textContent = `Szerokość: ${loc.lat.toFixed(4)}, Długość: ${loc.lon.toFixed(4)} (${loc.name})`;
            
            updateUserLocationMarker();
            updateStationsListView();
            if (map) {
                map.setView([gpsSimLocation.lat, gpsSimLocation.lon], 14);
            }
            showToast(`GPS przesunięty do: ${loc.name}`);
            
            // Przy symulacji również sprawdzamy, czy "wjechaliśmy" na stację
            checkGeofencing(gpsSimLocation.lat, gpsSimLocation.lon);
        }
    }

    // Synchronizacja z OSM
    async function syncOsmData() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Pobieranie bazy stacji...';

        try {
            const query = `[out:json][timeout:90];area["ISO3166-1"="PL"]->.searchArea;(node["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea);way["amenity"="fuel"]["brand"~"Orlen",i](area.searchArea););out center;`;

            // Ponieważ Overpass wymaga content-type application/x-www-form-urlencoded
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'data=' + encodeURIComponent(query)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const elements = data.elements || [];

            if (elements.length === 0) {
                throw new Error("Pobrano 0 stacji");
            }

            if (loadingText) loadingText.textContent = 'Przetwarzanie danych...';

            const newStations = [];

            elements.forEach(elem => {
                const tags = elem.tags || {};
                let lat = elem.lat;
                let lon = elem.lon;

                if (!lat || !lon) {
                    if (elem.center) {
                        lat = elem.center.lat;
                        lon = elem.center.lon;
                    }
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

                // Zachowaj stare dane jeśli istnieją
                const existingStation = stations.find(s => s.ID_Punktu === stationId);

                newStations.push({
                    ID_Punktu: stationId,
                    Nazwa_Stacji: existingStation ? existingStation.Nazwa_Stacji : name,
                    Adres: fullAddress,
                    Latitude: lat.toFixed(6),
                    Longitude: lon.toFixed(6),
                    Handlowiec: existingStation ? existingStation.Handlowiec : '',
                    Status: existingStation ? existingStation.Status : 'Do zrobienia',
                    Ostatnia_Aktualizacja: existingStation ? existingStation.Ostatnia_Aktualizacja : '',
                    Notatki: existingStation ? existingStation.Notatki : ''
                });
            });

            // Zachowaj też stacje z bazy, których OSM nie zwrócił, żeby nie zgubić danych (np. były w takcie)
            const existingIds = new Set(newStations.map(s => s.ID_Punktu));
            stations.forEach(s => {
                if (!existingIds.has(s.ID_Punktu) && s.Status !== 'Do zrobienia') {
                    newStations.push(s);
                }
            });

            stations = newStations;
            saveToLocalStorage();

            updateMapMarkers();
            updateStationsListView();
            updateStats();

            showToast(`Pomyślnie pobrano i zaktualizowano ${newStations.length} stacji z OSM!`);

        } catch (error) {
            console.error("Błąd podczas pobierania danych z OSM:", error);
            alert("Nie udało się pobrać najnowszych stacji z OSM. Błąd: " + error.message);
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
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
