# Offline-Synchronisationskonzept

WLAN im Lager ist unzuverlässig. Grundsatz: **Kein Netzwerkfehler darf Daten verlieren**
(Anforderung 11/21/31).

## Client-Seite (Android)

1. **Lokale Wahrheit zuerst.** Jede Erfassung wird sofort vollständig in Room gespeichert:
   `CaptureEntity` (Felder, Transkript, Status), `CaptureImageEntity` (Foto-Dateien im
   App-privaten Speicher), `PendingOperationEntity` (Upload-Queue).
2. **Upload-Queue.** Jede serverwirksame Aktion (Capture eröffnen, Bild hochladen,
   Sprachdaten senden, Antworten, Bestätigen) wird als Operation mit fortlaufender
   Sequenznummer eingereiht. Ein WorkManager-`SyncWorker` (Constraint: `CONNECTED`,
   Exponential-Backoff) arbeitet die Queue strikt in Reihenfolge je Capture ab.
3. **Idempotenz.** Jede Capture trägt eine client-generierte UUID (`client_capture_id`);
   jede Operation einen `Idempotency-Key`. Der Server dedupliziert Replays, doppelte
   Uploads erzeugen keine Duplikate.
4. **Statusanzeige.** Die App zeigt permanent: `✓ Synchronisiert` oder
   `☁ N Artikel warten auf Upload` (Badge in der TopBar + eigener Sync-Screen mit
   Fehlerdetails und „Jetzt erneut versuchen“).
5. **Konflikte.** Der Erfassungs-Workflow ist praktisch konfliktfrei (neue Datensätze).
   Bei `PATCH` auf bestehende Produkte sendet der Client `If-Unmodified-Since`
   (updated_at); bei 412 wird der Nutzer mit Server- und Lokalwert gefragt.
6. **Aufbewahrung.** Lokale Fotos/Audio werden erst gelöscht, wenn der Server den
   Empfang bestätigt hat und die Capture serverseitig gespeichert ist.

## Server-Seite

- Uploads werden zuerst vollständig in den Objekt-Storage geschrieben, dann der
  DB-Datensatz + Folgejob **in einer Transaktion** angelegt (kein „Bild ohne Datensatz“).
- Idempotency-Keys werden 7 Tage in der Tabelle `idempotency_keys` gehalten
  (Key → Response-Snapshot); Wiederholungen liefern die gespeicherte Antwort.
- Background-Jobs sind selbst retry-fähig (Backoff, `max_attempts`, Dead-Letter im Admin).

## Bestands-Synchronisation mit dem Shop (Anforderung 17)

- Verkauf im Shop → Webhook/Polling → `StockService.apply_movement(type=sale, −n)` →
  Movement + Audit + neuer Bestand.
- Bestandsänderung im Lager → Job `sync_stock` → `ShopConnector.update_stock()`.
- Jede Richtung läuft über Movements; es gibt keinen Pfad, der Bestand „direkt setzt“.
