# Personal und Ressourcen – Integration 3.57.15

Supabase: `personnel_week_capacity_status_v1` liefert mandantenbezogene Wochenstatus ohne Abwesenheitsgründe. `personnel_assignment_guard_v1` prüft neue und geänderte Einsätze serverseitig.

Frontend: `resource-personnel-link.js` ergänzt die Wochensteuerung; `employee-time.js` lädt das Modul.

Q-Gate vor Merge: Testläufe, Rollen- und Mandantenwechsel, Abwesenheiten, Konflikte, Qualifikationen, Regression von Touren und Zeitbuchungen. `index.html` muss im regulären Build die Referenz `employee-time.js?v=3.57.14` und die zentrale Versionsnummer auf 3.57.15 aktualisieren. Das ist noch offen. Keine produktive Freigabe ohne E2E-Prüfung.
