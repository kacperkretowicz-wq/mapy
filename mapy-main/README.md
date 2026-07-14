# Mobilny CRM dla Handlowców (Orlen SFA) z Mapą

Projekt zrealizowany w oparciu o specyfikację techniczną systemu klasy **SFA (Sales Force Automation)** dla przedstawicieli handlowych odwiedzających stacje paliw Orlen w całej Polsce. 

System umożliwia wizualizację punktów na mapie, filtrowanie handlowców, szybkie oznaczanie duplikatów, planowanie trasy oraz interaktywną zmianę statusu wizyt i notatek bezpośrednio z poziomu smartfona.

---

## 📂 Struktura Projektu

1. `fetch_stations.py` — Skrypt w Pythonie pobierający stacje Orlen w Polsce z **OpenStreetMap (Overpass API)** i zapisujący je do plików CSV i JSON. Posiada wbudowaną bazę awaryjną (fallback) na wypadek braku internetu lub przeciążenia serwerów OSM.
2. `run_server.py` — Prosty serwer deweloperski w Pythonie, który wykrywa Twój lokalny adres IP i podaje gotowy link do wpisania na telefonie.
3. `index.html` — Główny interfejs aplikacji webowej (zoptymalizowany pod ekrany telefonów).
4. `styles.css` — Stylowanie aplikacji premium (kolory marki Orlen, autorskie piny mapy, responsywny dolny panel - Bottom Sheet, animacje).
5. `app.js` — Logika biznesowa frontendowa (mapa Leaflet, geolokalizacja GPS, zapis w pamięci `localStorage` telefonu, import/eksport plików CSV).

---

## 🚀 Szybkie uruchomienie na telefonie (w 2 krokach)

Aplikacja została zaprojektowana tak, aby jej testowanie na smartfonie było maksymalnie uproszczone.

### Krok 1: Uruchomienie serwera
W terminalu, w folderze projektu, uruchom skrypt serwera deweloperskiego:
```bash
python run_server.py
```
Skrypt automatycznie wykryje Twój lokalny adres IP i wyświetli komunikat w konsoli.

### Krok 2: Otwarcie aplikacji na telefonie
1. Upewnij się, że Twój telefon i komputer są połączone z **tą samą siecią Wi-Fi**.
2. Otwórz przeglądarkę na telefonie (np. Chrome, Safari).
3. Wpisz adres IP wyświetlony w konsoli komputera, na przykład:
   ```text
   http://192.168.1.15:8000
   ```
*(Aplikacja działa również bezpośrednio na komputerze pod adresem `http://localhost:8000`)*.

---

## 🛠️ Instrukcja korzystania z aplikacji webowej

Aktualna baza: **2149 punktów** (zgodnie z oficjalną mapą ORLEN, type `1345`).

### Najprostszy flow dla handlowca (30 sekund)
1. Otwórz stację na mapie lub liście.
2. W panelu wybierz status: **Do zrobienia / Rozpocznij wizytę / Zakończ wizytę**.
3. Uzupełnij **Handlowca** i **Notatkę**.
4. Kliknij **Zapisz i synchronizuj**.
5. Jeśli punkt jest błędny/powielony: kliknij **Oznacz jako duplikat**.

1. **Zarządzanie Użytkownikami (RLS)**: Zaznaczenie opcji **"Tylko moje stacje"** sprawi, że na mapie i liście pojawią się wyłącznie punkty przypisane do danej osoby.
2. **Interaktywna Mapa**:
   - Kolor pinu zależy od statusu stacji: **Czerwony** (Do zrobienia), **Żółty** (W trakcie), **Zielony** (Zrobione).
   - Punkt oznaczony jako duplikat ma etykietę **DUPLIKAT** i można go odfiltrować przełącznikiem **Tylko duplikaty**.
   - Kliknięcie w pin stacji wysuwa od dołu panel szczegółów (Bottom Sheet).
   - Za pomocą szybkich akcji możesz błyskawicznie zmienić status (np. *Rozpocznij wizytę*).
   - Możesz zmienić przypisanego handlowca oraz wpisać notatki z wizyty.
   - Kliknięcie **Zapisz i synchronizuj** aktualizuje mapę i zapisuje dane trwale w pamięci przeglądarki telefonu (`localStorage`).
3. **Widok Listy i GPS**:
   - Przejdź do zakładki **"Lista"** w dolnym menu.
   - Wyszukaj stacje po mieście, ulicy lub ID.
   - Stacje są automatycznie **sortowane według odległości od Twojej pozycji**.
   - Aplikacja używa **Urządzenie (Real GPS)**.
   - Przycisk **Wyczyść filtry i pokaż całą mapę** przywraca pełny widok.
4. **Zarządzanie danymi CSV**:
   - W zakładce **"Dane / Ust."** możesz kliknąć **"Eksportuj do stacje_orlen.csv"**, by pobrać aktualny plik ze wszystkimi wprowadzonymi przez siebie notatkami i statusami.
   - Możesz również wgrać nowy plik CSV wygenerowany przez skrypt Python za pomocą przycisku **"Importuj z pliku CSV"**.

---

## 🤖 Konfiguracja w platformach No-Code (AppSheet / Glide)

Jeśli docelowo chcesz wdrożyć plik wygenerowany przez skrypt w platformach No-Code, oto instrukcja krok po kroku:

### Opcja A: Konfiguracja w Google AppSheet
1. **Zasilenie bazy**: 
   - Wrzuć plik `stacje_orlen.csv` na swój Dysk Google.
   - Otwórz go w **Arkuszu Google** (Google Sheets) i zapisz jako Arkusz Google.
2. **Utworzenie aplikacji**:
   - Wejdź na [appsheet.com](https://www.appsheet.com) i stwórz nową aplikację, wybierając przygotowany Arkusz Google jako źródło danych.
3. **Konfiguracja typów kolumn (Data -> Columns)**:
   - `ID_Punktu` -> Typ: `Text` (ustaw jako **Key**).
   - `Nazwa_Stacji` -> Typ: `Text` (ustaw jako **Label**).
   - `Adres` -> Typ: `Address` lub `Text`.
   - `Latitude` -> Typ: `Decimal`.
   - `Longitude` -> Typ: `Decimal`.
   - `Handlowiec` -> Typ: `Email`.
   - `Status` -> Typ: `Enum` (Wartości: `Do zrobienia`, `W trakcie`, `Zrobione`).
   - `Ostatnia_Aktualizacja` -> Typ: `DateTime`. Ustaw wartość początkową (Initial Value) na `NOW()` i zaznacz *Reset on edit*.
   - `Notatki` -> Typ: `LongText`.
4. **Widok Mapy (UX -> Views)**:
   - Stwórz nowy widok typu **Map**.
   - Jako *Map columns* wybierz `Latitude` i `Longitude`.
5. **Reguły kolorowania pinów (UX -> Format Rules)**:
   - Stwórz regułę **"Status Czerwony"**: warunek `[Status] = "Do zrobienia"`, wybierz ikonę pinu i kolor czerwony.
   - Stwórz regułę **"Status Żółty"**: warunek `[Status] = "W trakcie"`, kolor żółty.
   - Stwórz regułę **"Status Zielony"**: warunek `[Status] = "Zrobione"`, kolor zielony.
6. **Zabezpieczenie RLS (Row Level Security)**:
   - Wejdź w tabelę (Data -> Tables) i rozwiń właściwości tabeli stacji.
   - W sekcji **Security filter** wpisz formułę: `[Handlowiec] = USEREMAIL()`. Dzięki temu handlowcy zobaczą tylko przypisane do siebie punkty.

### Opcja B: Konfiguracja w Glide
1. Prześlij plik `stacje_orlen.csv` do **Glide Tables** lub podepnij pod ten sam Arkusz Google.
2. Dodaj komponent **Map** do ekranu głównego. Skonfiguruj współrzędne, wskazując na kolumny `Latitude` i `Longitude`.
3. Dodaj regułę stylizacji markerów (Marker Style/Color) na podstawie kolumny `Status`.
4. Włącz zabezpieczenie danych (RLS) w Glide, ustawiając kolumnę `Handlowiec` jako kolumnę typu **Row Owner** (w edytorze danych kliknij prawym przyciskiem myszy na nagłówek kolumny `Handlowiec` i wybierz *Make Row Owner*).
