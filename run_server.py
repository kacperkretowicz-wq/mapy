#!/usr/bin/env python
# -*- coding: utf-8 -*-

import http.server
import socketserver
import socket
import sys

PORT = 8000

def get_local_ip():
    """Funkcja próbująca pobrać adres IP w sieci lokalnej (LAN)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Nie musimy rzeczywiście nawiązywać połączenia, wystarczy sprawdzić trasowanie
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Wyłączamy cache, aby ułatwić testowanie zmian w plikach JS/CSS
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    local_ip = get_local_ip()
    
    print("==================================================================")
    print("      URUCHAMIANIE SERWERA CRM DLA WIZUALIZACJI NA TELEFONIE     ")
    print("==================================================================")
    print(f"\n[INFO] Serwer deweloperski uruchamia się w tym katalogu...")
    print(f"[INFO] Wyłączono cache przeglądarki dla łatwiejszego testowania.\n")
    
    print("------------------------------------------------------------------")
    print("  ABY URUCHOMIĆ NA TELEFONIE:")
    print("  1. Upewnij się, że telefon i ten komputer są w tej samej sieci Wi-Fi.")
    print("  2. Otwórz przeglądarkę w telefonie.")
    print(f"  3. Wpisz następujący adres:")
    print(f"\n     👉  http://{local_ip}:{PORT}  👈\n")
    print("  Na komputerze możesz otworzyć aplikację pod adresem:")
    print(f"     👉  http://localhost:{PORT}")
    print("------------------------------------------------------------------")
    print("\nNaciśnij Ctrl+C, aby zatrzymać serwer.\n")
    
    handler = MyHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nSerwer został zatrzymany pomyślnie.")
    except Exception as e:
        print(f"\nBłąd podczas uruchamiania serwera: {e}")

if __name__ == '__main__':
    main()
