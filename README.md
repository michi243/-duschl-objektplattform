# Duschl Service – Interne Objekt-Dokumentation 1.1

## Zweck
Diese Version ist ausschließlich für die interne Dokumentation durch Duschl Service gedacht.

Kernprozess:
Objekt → Begehung → Feststellung → Foto → Priorität → Maßnahme → Erledigung → Bericht

## Enthalten
- Objektverwaltung
- Begehungen
- Feststellungen
- Fotoaufnahme über Smartphone-Kamera
- Kategorien: Sicherheit, Funktion, Werterhalt, Optik, Komfort
- Prioritäten P1–P4
- Maßnahmenempfehlung
- Status: Offen / In Bearbeitung / Erledigt
- Objektbericht und Druck/PDF über Browser
- JSON-Sicherung und Wiederherstellung
- Mobile-first Oberfläche

## Noch nicht enthalten
- Benutzerlogin
- Kundenportal
- Cloud-Synchronisation
- Mehrbenutzerbetrieb
- Mandantenverwaltung
- Kundenfreigaben

## Wichtig
Die Daten werden in Version 1.1 lokal im Browser gespeichert. Deshalb ist die Version für den fachlichen Pilot geeignet, aber noch nicht für produktiven Mehrgeräte- oder Kundeneinsatz.

Auf iPhone/iPad sollten HTML-Dateien nicht über die Dateien-App/Quick-Look-Vorschau getestet werden, weil JavaScript dort eingeschränkt sein kann. Die Datei sollte über einen HTTPS-Webspace bereitgestellt werden, z. B. über eine Subdomain bei IONOS.

## Empfohlener nächster Schritt
1. index.html auf IONOS-Webspace hochladen.
2. Über HTTPS im Safari/Chrome öffnen.
3. Mit 2–3 realen Objekten testen.
4. Danach Stufe 2: Login, Cloud-Datenbank und Auftraggeberzugänge.
