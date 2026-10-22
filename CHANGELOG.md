# Versionsverlauf – Duschl Service Objektplattform

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
