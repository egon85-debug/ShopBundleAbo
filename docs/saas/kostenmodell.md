# Kostenmodell und Preisvorschlag

Stand: 28.09.2026. Alle Beträge **netto (ohne USt.)**. Dollar-Preise umgerechnet mit
**1 US-$ = 0,86 €** (Annahme; bei der Freigabe mit dem Tageskurs neu rechnen).

> Das ist eine Planungsrechnung, keine Steuer- oder Finanzberatung. Eigene Arbeitszeit,
> Support, Anwaltskosten, Versicherung und Steuern sind **nicht** enthalten.

## 1. Quellen (abgerufen am 28.09.2026)

| Anbieter | Preis | Quelle |
|---|---|---|
| Hetzner Cloud-Server (seit 15.06.2026) | CX23 5,49 € · CX33 8,49 € · CX43 15,99 € · CX53 29,49 € / Monat (ohne IPv4) | docs.hetzner.com/general/infrastructure-and-availability/price-adjustment |
| Hetzner IP-Adressen | Primary IPv4 0,50 € · **Floating IPv4 3,00 €** / Monat | docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing |
| Hetzner Object Storage | Grundpreis 13,87 € / Monat inkl. 1 TB Speicher + 1 TB Ausgangsverkehr; je weiteres TB 6,26 € Speicher, 1,00 € Verkehr | hetzner.com/storage/object-storage |
| Hetzner Server-Backups | 20 % des Serverpreises | Hetzner-Preisliste (vor Bestellung bestätigen) |
| Hetzner Storage Box (zweite Sicherungskopie) | ca. 4 € / Monat für 1 TB — **die Preisseite lieferte beim Abruf keinen eindeutigen Wert, vor Bestellung prüfen** | hetzner.com/storage/storage-box |
| KI (Anthropic, im Backend eingestelltes Modell der Sonnet-Klasse) | 2 $ Eingabe / 10 $ Ausgabe je 1 Mio. Tokens; Websuche 10 $ je 1.000; Stapelverarbeitung −50 % | Anthropic-Preisliste, Stand 2026-06 (übereinstimmend mit `backend/app/services/ki_verbrauch.py`) |
| Stripe (Deutschland) | EWR-Karten 1,5 % + 0,25 € · SEPA-Lastschrift 0,35 € · **Billing 0,7 %** des Abo-Volumens · Rückbuchung 20 € | stripe.com/de/pricing |
| Stripe Connect | Keine Plattformgebühr, wenn Stripe die Gebühren direkt beim Händler einzieht (`fees_collector = stripe`) | stripe.com/connect/pricing |
| Mail-Versand (EU) | Lettermint (NL) ab 10 € / Monat für 10.000 Mails; Scaleway TEM (FR) ca. 0,25 € je 1.000 nach 300 freien | lettermint.co; emailbump.com (Vergleich) — **vor Vertragsabschluss beim Anbieter bestätigen** |
| Google Play | einmalig 25 $ Entwicklerkonto | Play Console |
| Rechtstexte (zahlt der Händler selbst) | z. B. Händlerbund „AGB-Service + Schnittstelle“ ab 9,90 € / Monat | haendlerbund.de/…/agb-schnittstelle |

## 2. Annahmen

| Annahme | Wert | Begründung / wie prüfen |
|---|---|---|
| KI-Kosten je Artikel im Mittel | 0,15 $ ≈ **0,13 €** | Budgetbremse liegt bei 0,35 $; typische Artikel liegen deutlich darunter. **Vor der Preisfreigabe mit den echten Zahlen aus `ai_runs` von Winterfeld abgleichen.** |
| KI-Kosten je Artikel im schlechtesten Fall | 0,35 $ ≈ **0,30 €** | harte Obergrenze je Artikel |
| Ausnutzung des KI-Kontingents | 70 % | vorsichtig |
| Speicher je Artikel | ca. 20 MB (6 Originale + 6 Shopbilder) | 1.000 Artikel ≈ 20 GB ≈ 0,13 € / Monat — vernachlässigbar |
| Mails je Bestellung | 4 (Bestätigung, Zahlung, Versand, ggf. Rechnung) | |
| Paketmischung | 30 % Shop · 30 % Lager+App · 40 % Komplett | Annahme |

## 3. Fixkosten der Plattform je Monat

Server-Größen wachsen mit der Kundenzahl. Der Anwendungsserver erledigt anfangs auch
die Bildfreistellung (CPU-lastig); ab ca. 50 Kunden bekommt der Job-Worker einen eigenen
Server.

| Posten | 1 Kunde | 10 Kunden | 50 Kunden | 200 Kunden |
|---|---:|---:|---:|---:|
| Anwendungsserver | CX33 8,99 | CX33 8,99 | CX43 16,49 | CX53 29,99 |
| Worker-Server (KI, Bilder) | – | – | CX33 8,49 | 2 × CX43 31,98 |
| Datenbankserver | CX33 8,49 | CX33 8,49 | CX43 15,99 | CX53 29,49 |
| Server-Backups (20 %) | 3,40 | 3,40 | 8,10 | 18,20 |
| Floating IPv4 (feste Adresse für Kunden-Domains) | 3,00 | 3,00 | 3,00 | 3,00 |
| Object Storage (Bilder + Datenbank-Sicherung) | 13,87 | 13,87 | 16,00 | 26,40 |
| Storage Box (zweite Kopie) | 4,00 | 4,00 | 4,00 | 8,00 |
| Staging (ein kleiner Server) | CX23 5,99 | 5,99 | CX33 8,99 | CX33 8,99 |
| Mail-Dienst | 10,00 | 10,00 | 25,00 | 60,00 |
| Produktdomain | 1,25 | 1,25 | 1,25 | 1,25 |
| Überwachung / Fehlerverfolgung (selbst betrieben auf Staging bzw. Gratis-Stufe) | 0 | 0 | 0 | 20,00 |
| **Summe Fixkosten** | **≈ 59 €** | **≈ 59 €** | **≈ 107 €** | **≈ 237 €** |
| **Fixkosten je Kunde** | 59 € | 5,90 € | 2,14 € | 1,19 € |

## 4. Variable Kosten je Kunde und Monat

| Posten | Shop | Lager + App | Komplett |
|---|---:|---:|---:|
| KI typisch (70 % des Kontingents × 0,13 €) | 25 × 0,7 × 0,13 = 2,28 | 100 × 0,7 × 0,13 = 9,10 | 150 × 0,7 × 0,13 = 13,65 |
| KI schlechtester Fall (volles Kontingent × 0,30 €) | 7,50 | 30,00 | 45,00 |
| Speicher | 0,10 | 0,30 | 0,30 |
| Mails (200 Bestellungen × 4) | 0,50 | – | 0,50 |
| Stripe Billing 0,7 % + Kartengebühr 1,5 % + 0,25 € | 1,11 | 1,77 | 2,43 |
| **Summe typisch** | **≈ 4 €** | **≈ 11 €** | **≈ 17 €** |

Zahlungsgebühren der **Shop-Bestellungen** trägt der Händler selbst (Direct Charges mit
`fees_collector = stripe`), sie fehlen deshalb hier.

## 5. Preisvorschlag

| Paket | Monat | Jahr (2 Monate geschenkt) | KI-Artikel inklusive | Inhalt |
|---|---:|---:|---:|---|
| **Shop** | 39 € | 390 € | 25 | Shop, Shop-Admin, KI-Texthilfe |
| **Lager + App** | 69 € | 690 € | 100 | Lager-Web, App, KI-Erfassung, Anbindung an externe Shops |
| **Komplett** | 99 € | 990 € | 150 | alles |
| KI-Artikel über Kontingent | 0,49 € je Artikel | | | deckt den schlechtesten Fall (0,30 €) + Gebühren |
| **SEO Plus** (Zusatz) | 29 € | 290 € | 100 KI-Optimierungen | Search Console, Merchant Center, Monatsbericht |
| Einrichtungsgebühr | 149 € einmalig | | | „Einrichtung durch uns“ als Aufpreis-Option: 399 € |

Begründung: Der Preis je Paket liegt auch im **schlechtesten Fall** (Kontingent voll
ausgeschöpft, jeder Artikel am Budgetdeckel) über den variablen Kosten plus Fixkostenanteil
ab 10 Kunden. Über dem Kontingent verdient die Plattform an jedem Artikel.

## 6. Ergebnisrechnung

Mischpreis je Kunde: 0,3 × 39 + 0,3 × 69 + 0,4 × 99 = **72,00 €**.
Variable Kosten typisch: 0,3 × 4 + 0,3 × 11 + 0,4 × 17 = **11,30 €**.
(Ohne SEO Plus, ohne Einrichtungsgebühren, ohne Mehrverbrauch KI.)

| | 1 Kunde | 10 Kunden | 50 Kunden | 200 Kunden |
|---|---:|---:|---:|---:|
| Einnahmen | 72 € | 720 € | 3.600 € | 14.400 € |
| Fixkosten | 59 € | 59 € | 107 € | 237 € |
| Variable Kosten | 11 € | 113 € | 565 € | 2.260 € |
| **Deckungsbeitrag / Monat** | **≈ 2 €** | **≈ 548 €** | **≈ 2.928 €** | **≈ 11.903 €** |
| Marge | 3 % | 76 % | 81 % | 83 % |

Mit **einem** Kunden (Winterfeld selbst) trägt sich die Plattform gerade so; ab etwa
**zwei zahlenden Fremdkunden** ist sie in der Gewinnzone. Winterfeld zahlt heute bereits
für Hetzner, Vercel und Supabase — ein Teil dieser Kosten entfällt durch den Umzug.

## 7. Einmalige Kosten (außerhalb der Monatsrechnung)

- Google-Play-Entwicklerkonto 25 $; als **Organisation** anmelden (D-U-N-S-Nummer nötig,
  kostenlos, einige Tage Wartezeit) — dann entfällt der Pflicht-Test mit 12 Testern über
  14 Tage, der nur für neue **private** Konten gilt.
- Anwaltliche Prüfung von AVV, TOMs und Unterauftragsverarbeiter-Liste (Angebot einholen).
- Produktdomain.

## 8. Was das Modell unsicher macht

1. **KI-Kosten je Artikel** sind geschätzt. Die echten Zahlen stehen in `ai_runs` bei
   Winterfeld; vor der Preisfreigabe auswerten.
2. **Mail-Dienst**: Preis und vor allem die Frage, ob viele Absender-Domains per API
   anlegbar sind, beim Anbieter bestätigen.
3. **Storage-Box-Preis** vor Bestellung prüfen.
4. Hetzner hat 2026 die Preise stark erhöht (CPX-/CCX-Server bis 2,7-fach). Das Modell
   nutzt bewusst die günstigere CX-Reihe; ein Wechsel auf dedizierte CPUs würde die
   Fixkosten spürbar erhöhen.
