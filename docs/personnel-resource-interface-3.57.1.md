# Schnittstelle Personalmanagement ↔ Ressourcenplanung (v3.57.1 – Entwicklungsstand)

## Implementiert auf Feature-Branch
- `workforce-planning.js`: wiederverwendbare, reine Prüf-API `DSWorkforcePlanning.assessAssignment(payload)` (Browser) bzw. `require('./workforce-planning.js')` (Node).
- Mandanten-ID ist verpflichtend; alle geladenen Datensätze werden zusätzlich strikt anhand `organization_id` und `user_id` gefiltert.
- Aktives Beschäftigungsverhältnis, genehmigte Abwesenheiten, zeitliche Verfügbarkeitsblockaden, Doppelbuchungen und Qualifikationen werden validiert.
- Warnungen für gleichzeitige tagesbezogene Einsätze ohne Zeiten, unbekannte Arbeitszeitmuster und Überschreitung geplanter Tagesstunden.
- Keine Übermittlung von Abwesenheitsgründen, HR-Kommentaren, Jahrespersonalkosten oder GPS-Daten durch die Ergebnis-API.

## Noch NICHT integriert
- Der Browser lädt das Modul noch nicht; es gibt noch keinen Ressourcenplanungs-UI-Aufruf und keinen Schreibschutz beim Speichern von Zuordnungen.
- Es wurden keine RLS-Policies, SQL-Tabellen oder Produktivdaten geändert. Kein Release und keine neue produktive Versionsnummer.
- Eine bidirektionale Zeitsynchronisation oder automatische Stundenfreigabe ist nicht implementiert.

## Nächste technische Integration
1. In der Ressourcenplanung bei Benutzer- und Einsatzzuordnung Daten aus `personnel_relationships`, `personnel_availability_blocks`, `employee_absences`, `employee_work_patterns`, `user_service_qualifications` und `personnel_assignments_v1` laden. Nur aktuelle Organisation und serverseitig genehmigte Zugriffe verwenden.
2. `assessAssignment` aufrufen und BLOCK-Codes als nicht speicherbare Zuordnung, WARNING-Codes als prüfpflichtigen Hinweis behandeln.
3. Datenschutz: Disponenten dürfen nur Status "verfügbar/nicht verfügbar", Stunden und Qualifikation erhalten; keine Abwesenheitsart oder HR-Details. Aktuell erlauben HR-RLS-Policies nicht jedem Ressourcenplaner den lesenden Zugriff; dafür eine dedizierte, minimal berechtigte serverseitige Planungsschnittstelle unter Sicherheitsreview entwickeln – keinesfalls RLS abschalten.
4. `resource_capacity_profiles` mit Arbeitszeitmustern abstimmen: vertragliche Sollstunden haben eine eindeutige führende Quelle; jährliche Kalkulationswerte bleiben Planannahmen.
5. Zeitbuchungen nur nach vollständiger Prüfung und expliziter Freigabe in Soll-Ist-Berichte übernehmen. Test- und Produktivdaten strikt trennen.

## Q-Gate vor Merge/Deployment
- Kein Zugriff auf Personal-/Abwesenheitsdaten anderer Mandanten, auch nicht bei schnellem Mandantenwechsel.
- Disponent ohne HR-Berechtigung sieht keinen Krankenstand oder Begründungen.
- Urlaub genehmigt blockiert Einsätze; beantragter Urlaub blockiert NICHT automatisch.
- Verfügbarkeitsblock, fehlende Qualifikation, paralleler Einsatz sind sichtbar und korrekt bewertet.
- Mitarbeiter ohne Arbeitszeitmodell wird NICHT als 40h/Woche angenommen.
- Regression: bestehende Touren, GPS-Zeiterfassung, Testmodus/Produktivmodus, CSV, Ressourcenplanung.
- Jede tatsächlich ausgerollte Änderung erhält eine neue, sichtbare Versionsnummer. Feature-Branch allein ist **kein Release**.

## Eingabeformat (gekürzt)
```js
DSWorkforcePlanning.assessAssignment({
 organizationId: 'org-uuid',
 userId: 'user-uuid',
 date: '2026-11-02',
 startTime: '08:00:00', endTime: '12:00:00',
 relationships: [], absences: [], availabilityBlocks: [],
 workPatterns: [], qualifications: [], existingAssignments: [],
 requiredQualifications: []
});
```
Die leeren Listen sind nur die Schnittstellenform, nicht die fachliche Freigabe: ohne aktives Beschäftigungsverhältnis wird die Zuordnung blockiert.
