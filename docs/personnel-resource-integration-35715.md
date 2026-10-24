# Personal und Ressourcen – Integration 3.57.15

Supabase: `personnel_week_capacity_status_v1` liefert mandantenbezogene Wochenstatus ohne Abwesenheitsgründe. `personnel_assignment_guard_v1` prüft neue und geänderte Einsätze serverseitig.

Frontend: `resource-personnel-link.js` ergänzt die Wochensteuerung; `employee-time.js` lädt das Modul.

Q-Gate vor Merge: Testläufe, Rollen- und Mandantenwechsel, Abwesenheiten, Konflikte, Qualifikationen, Regression von Touren und Zeitbuchungen. `index.html` und `release.json` wurden auf v3.57.15 aktualisiert; das Cache-Busting für `employee-time.js` ist gesetzt. Automatisierte GitHub Actions prüfen Syntax, Smoke-Tests und Version. Authentifizierte Browser- und Mandanten-E2E-Prüfung bleibt offen. Keine produktive Freigabe ohne E2E-Prüfung.
