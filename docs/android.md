# Android-App-Struktur

Native Tablet-App: Kotlin, Jetpack Compose (Material 3), Single-Activity,
Navigation-Compose. Optimiert für Landscape-Tablets, große Touchflächen, minimale Klicks.

## Module & Pakete (`android/app/src/main/java/de/winterfeld/logistik/`)

```
WinterfeldApp.kt            # Application: manueller DI-Container (AppContainer)
MainActivity.kt             # Single Activity + NavHost
core/                       # Result-Typen, Formatierung (Geld, Datum), Konstanten
data/
├── local/                  # Room: AppDatabase, Entities (Capture, CaptureImage,
│                           #   PendingOperation, CachedProduct, …), DAOs
├── remote/                 # Retrofit ApiService, DTOs, AuthInterceptor,
│                           #   TokenStore (EncryptedSharedPreferences)
├── repo/                   # CaptureRepository, ProductRepository, AuthRepository,
│                           #   SyncRepository — Offline-first: erst Room, dann Queue
└── sync/                   # SyncWorker (WorkManager), OperationExecutor,
                            #   SyncStatusTracker (Flow<SyncStatus>)
capture/                    # Erfassungs-Workflow
├── CameraScreen.kt         # CameraX, Auslöser, Rollen-Chips (Vorderseite/EAN/…),
│                           #   Hinweis „fehlende Ansichten“
├── BarcodeAnalyzer.kt      # ML Kit Barcode aus dem Kamerastream
├── VoiceScreen.kt          # automatische Aufnahme nach Foto 1, „● Spracheingabe läuft…“,
│                           #   Live-Transkript (SpeechRecognizer) + Audio-Upload-Fallback
├── ReviewScreen.kt         # Kontrollbildschirm: Felder mit Confidence-Markern,
│                           #   Rückfragen, Kandidatenauswahl, Dubletten-Dialog,
│                           #   [Speichern][Bearbeiten][Weitere Fotos][Erneut sprechen][Shop vorbereiten]
└── CaptureViewModel.kt     # Zustandsmaschine des Workflows, Schnellmodus
ui/
├── theme/                  # Farben, Typografie (große Schrift), Formen
├── components/             # BigButton, StatCard, SyncBadge, ConfidenceChip, …
└── screens/                # Login, Dashboard, ProductList, ProductDetail, Stock,
                            #   Suppliers, StorageLocations, ShopReady, ShopPreview,
                            #   SyncStatus, Settings
```

## Screens / Userflows (Anforderung 18/19/37 Phase 2)

1. **Login** → 2. **Dashboard** („WINTERFELD LOGISTIK“, großer Button `+ ARTIKEL ERFASSEN`,
   Kennzahlen: heute / gesamt / zu prüfen / shopbereit / veröffentlicht, Navigation:
   Artikel, Bestand, Lagerplätze, Lieferanten, Shop, Synchronisierung, Einstellungen).
3. **Kamera** — öffnet sofort; erstes Foto startet Verarbeitung + Sprachaufnahme.
4. **Spracheingabe** — läuft parallel zur weiteren Fotoaufnahme; klarer Aktiv-Indikator.
5. **Verarbeitungsstatus** — Statuszeile (KI-Erkennung läuft → Produkt identifiziert →
   Preisrecherche → …), blockiert nichts.
6. **Kontrollbildschirm** — kompakte Übersicht, unsichere Felder gelb markiert, Rückfragen
   inline, Ein-Tipp-Korrekturen; Aktionen s. o.
7. **Schnellmodus** — Toggle auf dem Dashboard: Speichern zeigt 1,5 s „✓ Artikel
   gespeichert“ und springt direkt zurück in die Kamera.
8. **Sync-Screen** — `✓ Synchronisiert` / `☁ N Artikel warten auf Upload`, Fehlerliste,
   manueller Retry.

## Offline-Verhalten

Siehe [sync.md](sync.md): Room als lokale Wahrheit, WorkManager-Queue, Idempotenz über
`client_capture_id`/`Idempotency-Key`, Löschen lokaler Medien erst nach Serverbestätigung.

## Berechtigungen

`CAMERA`, `RECORD_AUDIO`, `INTERNET`. Laufzeit-Abfrage beim ersten Erfassen mit
Erklärungsdialog; Mikrofonnutzung ist immer sichtbar (Anforderung 24).

## Build

`compileSdk 35`, `minSdk 26`, Kotlin 2.0, Compose BOM. Keine Secrets im Client;
Server-URL wird in den Einstellungen konfiguriert (EncryptedSharedPreferences).
