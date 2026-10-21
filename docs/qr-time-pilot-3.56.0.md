## Erweiterung v3.56.2 – Testmodus, GPS-Vorschau und Ausnahmeregelung
- Objekt **Musterstraße** wurde in der Datenbank als Testobjekt gekennzeichnet; alle anderen Objekte blieben unverändert.
- Bereits vorliegender Probe-Check-in (139591 m Abweichung) wurde als **Test** und **offene Ausnahme** klassifiziert. Originalwert bleibt erhalten.
- **Arbeitszeit & Objektakte → Arbeitszeitmodus:** Umschaltung zwischen **Produktiv** und **Testmodus**. Beim Öffnen einer Objektakte bestimmt das Objektkennzeichen automatisch den Modus.
- Testobjekte lassen nur Testbuchungen zu; produktive Objekte ausschließlich Produktivbuchungen. Der Server erzwingt diese Übereinstimmung, auch wenn die App umgangen wird.
- Zeiten, Pausen und offene Objektbuchungen werden für Test/Produktiv getrennt geführt, einschließlich eigenständigem Verlaufsstatus.
- Bei Objekt-Check-in und -Check-out wird erst die einmalige GPS-Abfrage durchgeführt und **Distanz, Genauigkeit und Ergebnis vor der Buchung** angezeigt. **Standort erneut prüfen** und **Abbrechen** sind möglich.
- Bei validierter Nähe ist eine reguläre Buchung möglich. Bei Abweichung/fehlendem Standort ist eine **begründete Ausnahmebuchung** erforderlich (mindestens 10 Zeichen); diese gilt als prüfpflichtig.
- Für Ausnahmen gibt es unter **Einsatzübersicht → GPS-Ausnahmebuchungen** die Berechtigungen **Genehmigen/Ablehnen**. Entscheidungen werden gesondert und nachvollziehbar gespeichert.
- **CSV-Export:** jeweils nur der aktuell gewählte Modus; Testbuchungen sind eindeutig mit `TEST – NICHT ABRECHNEN` gekennzeichnet. Produktions-CSV schließt nicht genehmigte Ausnahmebuchungen aus. **Export ist kein finaler Lohnabrechnungsnachweis.**
- GPS-Rohkoordinaten werden nicht in der Datenbank gespeichert; unbestätigte GPS-Position wird nach spätestens 60 Sekunden aus dem Browserstatus verworfen.

### Testanleitung
1. QR der Musterstraße scannen, anmelden, Objektakte öffnen: Es muss **TESTMODUS** erscheinen.
2. Check-in oder vorhandenen offenen Check-out starten; Distanz und Genauigkeit kontrollieren.
3. Bei falscher Position **Standort erneut prüfen**; alternativ nachvollziehbare Begründung eingeben und Ausnahmebuchung absenden.
4. Unter Admin → **Arbeitszeit & Objektakte** im Testmodus offene GPS-Ausnahmen öffnen und genehmigen/ablehnen.
5. **Testbuchungen als CSV** exportieren; alle Zeilen müssen mit `TEST` markiert sein.
6. Zu einem Nicht-Testobjekt wechseln: Oberfläche wechselt automatisch in den Produktivmodus. Der Testeintrag darf dort weder in Übersicht noch im Export erscheinen.
7. Serverseitige Tests: Objekt-/Zeitmodus-Mismatch, Ausnahme ohne Grund und unberechtigtes Freigeben müssen abgewiesen werden.

### Grenzen
- Browser-/Smartphone-End-to-End-Test und unternehmensinterne Datenschutzfreigabe stehen aus.
- Bestehende produktive Zeiterfassung ist ein Pilot; für endgültige Monatslohndaten fehlen Korrekturen, Freigabe der Gesamtstunden und belastbare Wegzeitverteilung.
- Die Rolle `platform_admin` und Mandanten-Admins können Testbuchungen verwalten; normaler Mitarbeiter braucht weiterhin ausdrückliche Zeitfreigabe und Objektzuordnung.
- Die GPS-Prüfung ist nur eine Plausibilisierung, kein sicherer Aufenthaltsnachweis und keine Live-Ortung.


# Duschl Service – QR-Objektportal und Arbeitszeiterfassung (Pilot 3.56.0)

## Mitarbeiter freigeben (ab v3.56.1)
1. Im richtigen Mandanten als Mandanten-Admin oder Admin-Vertretung anmelden.
2. Menü **Benutzer & Berechtigungen** öffnen.
3. Bereits angelegten operativen Mitarbeiter auswählen; Rollen **Objektbetreuung** oder **Externer Auftragnehmer** sind vorgesehen.
4. Direkt unter dem Benutzernamen die Karte **Arbeitszeiterfassung** suchen.
5. **Mitarbeiter für Arbeitszeiterfassung freigeben** aktivieren und **Zeiterfassungsfreigabe speichern** betätigen.
6. Für Objekt-QR-Check-in muss der Mitarbeiter zusätzlich dem Objekt zugewiesen sein. Die Freigabe ersetzt keine Objektberechtigung.
7. Mitarbeiter kann den QR-Code erneut öffnen oder nach spätestens einer Minute die Freigabe sehen; bei Problemen Seite aktualisieren.
8. Ein Entzug der Freigabe blockiert neue Buchungen serverseitig. Historische Zeitereignisse bleiben erhalten.

Die reine Mandantenrolle erteilt **keine** Zeiterfassungsfreigabe. Die explizite Flagge wird pro Mandant gespeichert und ist standardmäßig deaktiviert. Mandantenadministratoren haben für Pilot-/Testzwecke weiterhin eigenen Zugriff.

## Architektur
- Bestehender, bereits gedruckter QR-Code `?meldung=<object_id>` bleibt gültig: Bewohner gelangen ohne Anmeldung zu ihrer Meldung. Der öffentliche Bildschirm bietet zusätzlich **„Mitarbeiter / Verwaltung · zur Objektakte“**.
- Der interne Link `?objekt=<object_id>` öffnet nach Anmeldung und Mandantenprüfung die digitale Objektakte.
- Die Akte aggregiert ausschließlich bereits berechtigt geladene Feststellungen, Dokumentationen und vorhandene Fachmodule. Keine zweite Datenspeicherung.
- Mitarbeiter bedienen **Arbeitszeit & Objektakte** über Menü oder QR-Link.
- Bestätigte Buchungen sind getrennt in **Dienstbeginn/-ende**, **Pausenbeginn/-ende** sowie **Objekt-Check-in/-out**. Erster Check-in kann zugleich den Arbeitstag eröffnen.
- Administratoren sehen den letzten **bestätigten Check-in-Status** und das Ergebnis der GPS-Plausibilisierung. Dies ist ausdrücklich **kein Echtzeit-GPS-Ortungsdienst**.
- Die Supabase-Tabelle `public.employee_time_events` ist append-only. Keine Änderungen oder Löschungen durch Frontendnutzer. RLS: eigene Daten oder Berechtigung zur Mandantenadministration.
- Ein Datenbank-Trigger setzt Benutzeridentität und Zeitstempel serverseitig und validiert Objekt- und Mandantenrechte. Exakte GPS-Koordinaten werden nach Berechnung von Entfernung und Genauigkeit verworfen.

## GPS
- GPS wird **nur beim bewussten Check-in/Check-out** mit Browser-Zustimmung abgefragt.
- Ohne GPS oder bei fehlender Objektkoordinate ist die Buchung möglich, aber ausdrücklich als nicht validiert markiert.
- Abweichung und GPS-Genauigkeit erscheinen als Prüfhinweis, nicht als manipulationssicherer Aufenthaltsnachweis.
- Objektadresse benötigt gegebenenfalls vorherige Geokodierung in den Objektstammdaten.
- Kein dauerhaftes Tracking, keine Speicherung von Bewegungsprofilen und keine GPS-Abfrage im Hintergrund.

## Testfälle vor breiter Nutzung
1. Bewohner: vorhandenen Objekt-QR scannen, Gemeinschaftsmeldung erstellen. Kein Zugriff auf interne Objektakte, Mitarbeiterzeiten oder Administrationsdaten.
2. Mitarbeiter: QR öffnen, anmelden, Objektakte und SOP/Feststellungen sehen. Check-in bestätigen und GPS erlauben; serverseitige Uhrzeit, Objekt und Standortstatus prüfen.
3. Mitarbeiter: Pause beginnen/beenden, Objekt verlassen, Feierabend. Unzulässige Doppelbuchungen müssen abgewiesen werden.
4. Mitarbeiter: GPS verweigern. Buchung muss möglich bleiben und `GPS nicht verfügbar` anzeigen.
5. Mitarbeiter: Objekt ohne hinterlegte Koordinaten prüfen. Buchung mit entsprechendem Hinweis.
6. Mitarbeiter: fremdes Objekt öffnen oder per REST Buchung für fremden Mandanten versuchen. Muss serverseitig abgewiesen werden.
7. Mandantenadmin: Übersicht zeigt Objekt des letzten Check-ins, Status, Zeitpunkt und GPS-Validierung; nur im zugehörigen Mandantenkontext.
8. Rollenwechsel/Logout: interne Buchungsdaten verschwinden aus der Bedienoberfläche; erneute Anmeldung erforderlich.
9. Bereits bestehende Touren, Anmeldung, Winterdienst, Feststellungen, Objekt-QR-Druck, Benutzerverwaltung und Bewohnerformulare erneut prüfen.
10. Mobile Browser: Standortberechtigung, HTTPS, Safari/Chrome, schwacher Empfang.

## Noch nicht Lohnabrechnung-ready
- CSV-Export enthält derzeit **Zeitbuchungen**, keine freigegebene Brutto-Netto- oder Monatsabrechnung.
- Für produktiven Personaleinsatz fehlen ein überprüfbarer **Zeitkorrektur-/Freigabeprozess**, explizite Behandlung von vergessenen Scans und die geprüfte Aggregation bezahlter Wege- und Objektzeiten.
- Vor Beschäftigten-Pilot: erforderliche Datenschutzinformationen, Rechtsgrundlage, Erforderlichkeitsprüfung für GPS, Löschfristen, Zugriffskonzept und Verfahren für Beschäftigtenrechte dokumentieren.
- Keine stillschweigende Einführung einer dauerhaften Personalortung.

## Rollout
Die Supabase-Migration `employee_qr_time_events_v1` wurde im Projekt `duschl-objektplattform` eingespielt. Frontend gehört zu Release 3.56.0.
