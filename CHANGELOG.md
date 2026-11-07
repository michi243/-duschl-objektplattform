## v3.57.32 – 07.11.2026 – Müllmanagement direkt im Objekt

- Separaten Hamburger-Menüpunkt „Müllmanagement / QR“ entfernt.
- Eintrag bei **Objekt → Leistungen & Standards → Abfall / Müllbereitstellung**, nur bei aktiver Beauftragung im Gültigkeitszeitraum.
- Zusätzlich ein **objektbezogener Schnellzugriff** in der Objektkarte für berechtigte Mitarbeiter; Sichtbarkeit aus serverseitigem Beauftragungs- und Berechtigungs-RPC, nicht aus Browserannahmen.
- Müllmodul öffnet in einem Objektkontext, ohne Objektauswahl; Tonnenverwaltung, QR-Druck, Füllstandserfassung und Jahresauswertung bleiben erhalten.
- Bereits gedruckte Tonnen-QR-Codes führen nach Anmeldung direkt in diesen Objektkontext.
- Verwaltung mit Lesezugriff sieht Auswertungen, kann jedoch keine Tonnen oder Füllstände verändern.
- Ein ergänzender read-only-RPC liefert ausschließlich aktuell beauftragte, berechtigte Objekt-IDs; vorhandene RLS-Policies und Messdaten bleiben unverändert.
- Q-Gate: Mandantenwechsel, Fremdobjekte, Leistungsende, QR-Deep-Link und Versionierung vor Veröffentlichung prüfen.

## v3.57.31 – 07.11.2026 – Kompakte QR-Tonnenetiketten

- Drucketikett und PNG-Export zeigen ausschließlich **Straße/Objekt**, **individuellen QR-Code** und **Behälternummer**.
- Etikettenformate **62 × 40 mm (Standard)** und **50 × 30 mm** auswählbar; Etikettendruck nutzt passende Seitengröße ohne A4-Ränder.
- Hochauflösendes Schwarz-Weiß-Etikett (ca. 305 dpi), QR-Inhalt unverändert, ausschließlich UI/Druckdarstellung geändert.
- Kein Eingriff in Datenbank, RLS, Rollen, Scans, Erfassungs- oder Jahresauswertungslogik.
- QR-Label-Q-Gate ergänzt; tatsächlicher Etikettendruck am jeweiligen Druckermodell ist separat zu prüfen.

## v3.57.30 – 07.11.2026 – Müllmanagement mit individuellen Tonnen-QR-Codes

- Eigener QR-Code pro Mülltonne; Scan führt nach Anmeldung unmittelbar zur 0/25/50/75/100-%-Erfassung.
- Pro Behälter: Objekt, Abfallart, Volumen, optionale Leerungen/Woche und tatsächliche jährliche Ist-Gebühr.
- Beauftragung „Abfall / Müllbereitstellung“ ist serverseitige Voraussetzung für die Erfassung.
- Pro Tonne und Tag maximal eine append-only-Erfassung; Uhrzeit und Mitarbeiter werden serverseitig gesetzt.
- Jahresbericht mit Durchschnitt und P90, CSV-Export und Druck/PDF; ab acht Messwerten werden Prüfpotenziale markiert.
- Additive Tabellen mit RLS und expliziten Data-API-GRANTs, keine Änderung bestehender Service-/Tourendaten.
- **Rollout-Gate:** SQL-Migration, Mandanten-/Objekt-Berechtigungen und mobiler Scan müssen vor Produktivfreigabe verifiziert werden.

## v3.57.29 – 02.11.2026 – Objektrollen direkt zur Bearbeitung verlinkt

- Schaltfläche **Rollen bearbeiten** bei jeder Person unter **Personen & Rollen** in der Objektkarte.
- Öffnet die bestehende Benutzerverwaltung mit vorausgewähltem Benutzer, Objektrolle und Mandantenrolle; bestehender Speichervorgang bleibt maßgeblich.
- Einschließlich inaktiver Objektzuweisungen und mandantenweit berechtigter Administratoren; neue Objektrollen werden nicht automatisch vergeben.
- Mandantenprüfung vor Navigation und nach dem Laden; kein neuer Schreibpfad, keine SQL-, RLS- oder Backend-Änderung.

## v3.57.28 – 02.11.2026 – Personen & Rollen je Objekt

- In der aufgeklappten Objektkarte zeigt die Administration jetzt einen Abschnitt **Personen & Rollen**.
- Übersicht über direkte Objektzuweisungen mit Mandantenrolle, Objektrolle, Aktivitäts- und Gültigkeitsstatus.
- Mandanten-Admins und Admin-Vertretungen mit mandantenweitem Zugriff ohne explizite Objektrolle werden gesondert ausgewiesen; keine impliziten Objektrollen für neue Benutzer.
- Benutzer- und Berechtigungsdaten werden erst beim Aufklappen frisch über bereits vorhandene, serverseitig autorisierte Endpunkte abgerufen; kein Anzeigezugriff für operative Rollen oder Auftraggeber.
- Keine neuen Berechtigungen, keine Änderungen an RLS, Datenbankschema, Migrationen oder Mandantenzuordnungen.
- Q-Gate: Rollen-/Mandantentrennung, deaktivierte Benutzer, fehlende Objektzuweisung und Mandantenwechsel im Browser testen.

## 3.57.27 – Duschl Service Angebots-CI

- Kopfbereich mit größerem Logo und dunkelblauen Akzenten statt Gold, angelehnt an das bestehende Angebotsschema.

# Versionsverlauf – Duschl Service Objektplattform

## v3.57.21 – 26.10.2026

- Angebotsvorlage je Mandant: Briefkopf, Steuerstatus, Bank- und Kontaktdaten sowie PNG-Logo verwalten.
- Gespeicherte Angebote als DIN-A4-Druckvorschau öffnen; PDF im Browserdialog speichern oder ausdrucken.
- Fehlende Pflichtangaben für den Kundenversand werden in der Dokumentvorschau als Prüfhinweis angezeigt. Anfragen bleiben ohne Pflichtfelder erfassbar.
- E-Mail-Versand und PDF-Ablage verbleiben in Option A manuell.


## v3.57.20 – 26.10.2026

- Telefonannahme: alle Eingaben inklusive Ansprechpartner, Kontaktweg, Leistung und Beschreibung optional; Datensätze können vollständig leer begonnen und später ergänzt werden.
- Datenbank: geschäftliche Anfragefelder nullable, bisherige Mandanten- und Rollenprüfung unverändert. Angebotsübernahme erzeugt auch bei fehlendem Namen einen gültigen Objekttitel.
- Bei tatsächlich ausgefüllten Werten bleiben Format- und Feldlängenprüfungen erhalten. Eine E-Mail-Adresse ist nicht verpflichtend.


## v3.57.19 – 26.10.2026

- Fehlerbehebung: Benutzer sehen bei unvollständigen Anfragen direkt am Speichern-Button die konkrete Ursache, betroffene Pflichtfelder werden markiert und fokussiert.
- Nach erfolgreichem Datenbank-Commit: Liste sichtbar aktualisieren und Speicherbestätigung mit Anfrage-Referenz ausgeben.
- Frontendmodule mit Versionsparametern zur Cache-Aktualisierung.

## v3.57.18 – 26.10.2026

- Neues Mandantenmodul für telefonische und sonstige Kundenanfragen ohne Pflicht-Objektbezug, inklusive Schnellaufnahme, Wiedervorlage und Suchfiltern.
- Angebotsverwaltung mit Positionskalkulation, manueller Annahme und kontrollierter Übernahme als neues Objekt, vorhandenes Objekt oder objektfreier Einzelauftrag.
- Bestehende private Bewohneranfragen einschließlich vorhandener Angebote können kontrolliert in die Geschäftsanfragen übernommen werden, ohne deren Ursprungsvorgänge zu verändern.
- Vertriebliche Tabellen mit RLS-Sperre, ausschließlich mandantenautorisierten RPCs, Dublettenprüfung und neuen Q-Gates; Browsermodule versioniert.


## v3.57.17 – 25.10.2026 (Entwicklung / Testbetrieb)

- Nicht mehr gepflegte Marketing-HTML im Repository-Stamm durch eine Weiterleitung zur aktiven `docs/marketing.html` ersetzt.
- Veraltete 3.41-Vorschau (ca. 1,86 MB) durch eine Weiterleitung zur aktuellen Objektplattform ersetzt; ursprünglicher Inhalt bleibt in der Git-Historie verfügbar.
- Aktive Pfade und Dokumentation im README konsolidiert; Release-Metadaten und Versionsanzeige synchronisiert.
- Keine Änderung an Supabase-Daten, Objektberechtigungen oder QR-Kampagnen.

## v3.57.16 – 24.10.2026 (Entwicklung / Testbetrieb)

- Plattform- und Mandantenadministration von persönlicher Zeiterfassung getrennt; serverseitige operative Zeitbuchungsberechtigung ergänzt.
- Testbuchungen bleiben erhalten, administrative Auswertungen bleiben verfügbar.


## v3.57.8 – 22.10.2026 (Entwicklung / Testbetrieb)

- Personalmanagement: Beschäftigungsbeginn als konkretes Datum, mit gezielter Berichtigung eines bestehenden Datensatzes statt einer doppelten Anlage.
- Anzeige des gespeicherten Vertragsstands (Wochenstunden, Arbeitstage, Urlaub) und Warnung bei widersprüchlichem Beschäftigungs-/Vertragsbeginn.
- Für einen bestehenden Vertragsbeginn wird derselbe Datensatz aktualisiert und das Ergebnis erneut gelesen; neue Vertragsbeginne erzeugen historische Stände.
- Datenbank: Eindeutigkeitsindex auf (Mandant, Mitarbeiter, Gültig ab) verhindert doppelte Vertragsstände.
- DB-RLS-Regression: autorisierter Vertrags- und Beschäftigungs-UPDATE, Ablehnung doppelter Vertragsstände transaktional geprüft und zurückgerollt.
- Frontend: JavaScript-Syntax geprüft; authentifizierter Browser-End-to-End-Test steht weiter aus.

## v3.57.7 – 22.10.2026 (Entwicklung / Testbetrieb)

- Behebt den Ladeabbruch „feedback is not defined“ im Personalmanagement.
- Personal-Ladefunktionen wieder im selben Gültigkeitsbereich wie `feedback`, `loadHrScope`, `allowedHR` und Vertragsstatus gehalten; verhindert weitere `ReferenceError` beim Laden.
- Skript-Caching durch neue Version im HTML aufgehoben; JavaScript-Syntax geprüft.

## v3.57.6 – 22.10.2026 (Entwicklung / Testbetrieb)

- Plattformadministratoren aktivieren und widerrufen Personalzugriff explizit pro Mandant; kein pauschaler Zugriff auf Personalakten fremder Mandanten.
- Neue RLS-geschützte Mandantenfreigabe `platform_hr_scopes`, Berechtigungssynchronisierung für Personaldaten sowie manuelle Zeitnachträge und Feiertagsregeln.
- Vertragsdaten erst nach tatsächlich gespeichertem aktivem Arbeitnehmerverhältnis; Datum, Wochenstunden, Urlaubstage werden vor dem Speichern geprüft.
- Rollen-/Objektzuordnungen und Zeitbuchungen bleiben unverändert; keine automatische Umdeutung zu Beschäftigungsverhältnissen.
- Prüfungen: JavaScript-Syntax und transaktionaler RLS-/Vertragsschreibtest (Rollback). Browser-End-to-End-Abnahme bleibt im Testbetrieb ausstehend.

## v3.57.0 – 22.10.2026 (Entwicklung / Testbetrieb)

- Zentrales Release-Manifest in `release.json` als einzige Quelle der Versionsnummer.
- Versionsanzeige in der Plattform mit Release-Kanal, Datum und Entwicklungsstatus.
- Erweiterte Personalverwaltung: Beschäftigungsverhältnisse, Urlaubs-/Zeitkonten, manuelle Zeitnachträge, Freigaben.
- Zentrale Personaleinsatzplanung, Abwesenheitsprüfung und Anbindung von Winterdienstläufen.
- Hinweis: Personal- und Arbeitszeitabrechnung bleiben im **Testbetrieb**; nicht sämtliche Tourenarten sind vollständig synchronisiert.

### Versionierung

- `MAJOR.MINOR.PATCH`: Breaking Change / Funktionserweiterung / Fehlerkorrektur.
- `release.json` vor einem Release anpassen und den Eintrag hier ergänzen.
- GitHub-Commit dient als technischer Revisionsnachweis; die Manifest-Version ist die sichtbare Release-Kennung.
- Nur getestete, freigegebene Releases erhalten den Kanal `production`.

### Ausgangspunkt

- Das Modul `employee-time.js` führte bisher die Kennung `v3.56.0`.
- Die Gesamtplattform hatte keine zuverlässig zentral auslesbare Version.
- Der neue gemeinsame Versionsstand beginnt bei `v3.57.0`; bereits frühere Versionskennungen in anderen Dateien werden nicht automatisch rückwirkend angepasst.
