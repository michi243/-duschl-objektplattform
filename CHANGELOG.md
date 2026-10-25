# Versionsverlauf – Duschl Service Objektplattform

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
