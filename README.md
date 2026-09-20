# Duschl Service Objektplattform

## Zweck

Die Duschl Service Objektplattform unterstützt die strukturierte
Steuerung operativer Vorgänge rund um Immobilien und betreute Objekte.

Sie verbindet Dokumentation, Bewohnermeldungen, Arbeitsvorgänge,
Entscheidungen und externe Dienstleister in einem durchgängigen Prozess.

**Kernprozess:**

Objekt → Meldung / Dokumentation → Zuständigkeit → Arbeitsvorgang →
Bearbeitung → Entscheidung → Abschluss → Historie

------------------------------------------------------------------------

## Kernfunktionen

-   Mandantenfähige Benutzer- und Organisationsstruktur
-   Rollen- und objektbezogene Berechtigungen
-   Verwaltung mehrerer Objekte
-   Objektzuordnung für Mitarbeiter und Dienstleister
-   Dokumentationen und Feststellungen
-   Foto- und Vorher-/Nachher-Dokumentation
-   Prioritäten und Statussteuerung
-   Arbeitsvorrat für offene Vorgänge
-   Entscheidungen und Freigaben
-   Weitergabe von Vorgängen an externe Dienstleister
-   Rückgabe und Neuvergabe von Arbeitsaufträgen
-   Nachvollziehbare Vorgangs- und Bearbeitungshistorie
-   Bewohner- und Besuchermeldungen über QR-Code
-   Automatisches Routing anhand definierter Leistungsumfänge
-   Interne Mitteilungen und Lesestatus
-   E-Mail-Benachrichtigungen für relevante Ereignisse
-   Zusammenfassungen offener Vorgänge per E-Mail
-   Objektberichte und browserbasierte Druck-/PDF-Ausgabe
-   Mobile-first Benutzeroberfläche

------------------------------------------------------------------------

## Rollen und Organisationen

Die Plattform unterstützt mehrere Organisationen innerhalb einer
gemeinsamen Systemumgebung.

Dazu gehören beispielsweise:

-   Objektservice
-   Hausverwaltungen
-   Eigentümer / Auftraggeber
-   externe Dienstleister

Benutzer können mehreren Organisationen angehören und dort
unterschiedliche Rollen besitzen.

Unterstützte Rollen sind unter anderem:

-   Plattform-Administrator
-   Mandanten-Administrator
-   Verwalter / Objektsteuerung
-   Objektbetreuer
-   Auftraggeber / Eigentümer
-   Testbenutzer

Der Zugriff auf Objekte und Vorgänge richtet sich nach Organisation,
Rolle und konkreter Objektberechtigung.

------------------------------------------------------------------------

## Zusammenarbeit mit Dienstleistern

Hausverwaltungen und Objektverantwortliche können Dienstleister
objektbezogen einbinden und Leistungsumfänge definieren.

Vorgänge können anschließend gezielt an den zuständigen Dienstleister
übergeben werden.

Der Prozess unterstützt:

**Vergabe → Annahme → Bearbeitung → Dokumentation → Abschluss**

sowie bei Bedarf:

**Rückgabe → Entscheidung → interne Übernahme oder Neuvergabe**

Die Prozesshistorie bleibt dabei nachvollziehbar erhalten.

------------------------------------------------------------------------

## Bewohner- und Besuchermeldungen

Für Objekte können QR-Codes bereitgestellt werden.

Bewohner oder Besucher können darüber ohne Benutzerkonto ein Anliegen
melden.

Die Meldung wird anhand des Objekts und des gewählten Bereichs
aufgenommen und kann über hinterlegte Zuständigkeiten an den zuständigen
Dienstleister weitergeleitet werden.

Grundsatz:

**Eine Meldung = ein Anliegen**

Dadurch bleiben Routing, Zuständigkeit und Bearbeitungsstatus eindeutig.

------------------------------------------------------------------------

## Benachrichtigungen

Die Plattform informiert Benutzer ereignisbezogen über relevante
Vorgänge.

Dazu gehören beispielsweise:

-   neue Arbeitsaufträge
-   neue interne Arbeitsvorgänge
-   notwendige Entscheidungen
-   zurückgegebene Arbeitsaufträge
-   geroutete Bewohnermeldungen
-   nicht automatisch zuordenbare Meldungen

Zusätzlich können periodische Zusammenfassungen offener Vorgänge
erstellt werden.

------------------------------------------------------------------------

## Technische Architektur

**Frontend**

-   HTML / CSS / JavaScript
-   GitHub Pages
-   Mobile-first

**Backend**

-   Supabase
-   PostgreSQL
-   Supabase Authentication
-   Row Level Security (RLS)
-   PostgreSQL Functions / RPCs
-   Edge Functions

**Benachrichtigungen**

-   Supabase Notification Outbox
-   Edge Function
-   Resend
-   ereignisbasierter E-Mail-Versand

------------------------------------------------------------------------

## Berechtigungsmodell

Die Zugriffssteuerung folgt grundsätzlich der Kette:

**Benutzer → Organisationsmitgliedschaft → Rolle → Objektberechtigung →
Vorgang**

Dadurch können mehrere Hausverwaltungen, Dienstleister und weitere
Organisationen innerhalb derselben Plattform arbeiten, ohne
unberechtigten Zugriff auf Daten anderer Mandanten zu erhalten.

------------------------------------------------------------------------

## Datenschutz und Sicherheit

Die Plattform verwendet rollen- und objektbezogene Zugriffsrechte.

Datenzugriffe werden serverseitig über Supabase und Row Level Security
abgesichert.

Externe Dienstleister erhalten ausschließlich Zugriff auf die für ihre
Zusammenarbeit erforderlichen Objekte und Vorgänge.

------------------------------------------------------------------------

## Aktueller Entwicklungsstand

Aktuelle Frontend-Version:

**v2.21.08**

Die Plattform befindet sich in aktiver Entwicklung und wird derzeit
anhand realer Objekt-, Hausverwaltungs- und Dienstleisterprozesse
weiterentwickelt.

------------------------------------------------------------------------

## Zielbild

Die Duschl Service Objektplattform soll keine klassische
Hausverwaltungssoftware ersetzen.

Sie bildet die operative Ebene zwischen Objekt, Hausverwaltung,
Objektservice, Dienstleister und Bewohner ab.

Ziel ist ein durchgängiger Prozess mit:

**klaren Zuständigkeiten, weniger Rückfragen, vollständiger
Dokumentation und nachvollziehbaren Entscheidungen.**
