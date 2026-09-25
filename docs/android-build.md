# Android-App bauen und verteilen

## Das APK holen

Bei jeder Aenderung unter `android/` baut GitHub Actions ein installierbares
APK (Workflow „Android-App"). Auf dem Hauptzweig erscheint es als Release —
direkt als `.apk`, immer unter derselben Adresse:

    https://github.com/egon85-debug/Winterfeld-Logistik/releases/latest

Fuer Pull Requests und andere Zweige liegt es unter **Actions → der Lauf →
Artifacts** (als ZIP).

Auf dem Geraet einmalig die Installation aus unbekannten Quellen fuer den
Browser oder Dateimanager erlauben, dann das APK oeffnen.

## Lokal bauen

```
cd android
./gradlew assembleDebug testDebugUnitTest
# → app/build/outputs/apk/debug/app-debug.apk
```

Voraussetzungen: JDK 17 oder neuer, Android-SDK mit Plattform 35
(`ANDROID_HOME` gesetzt).

Das APK enthaelt nur ARM-Maschinencode (alle Handys und Tablets ab Android 8).
Fuer einen x86-Emulator am PC: `./gradlew assembleDebug -PalleAbis`.

Anderer Server als Vorgabe im Anmeldebildschirm:

```
./gradlew assembleDebug -PserverUrl=https://anderer.server.de
```

## Bildschirme ansehen ohne Handy

Die wichtigsten Screens lassen sich in Handygroesse als Bild rendern
(Paparazzi, laeuft auf der JVM — kein Emulator noetig):

```
./gradlew -Pscreenshots :app:recordPaparazziDebug
# → app/src/test/snapshots/images/*.png
```

Die Beispieldaten stehen in `app/src/screenshotTest/…/ScreenshotTest.kt`.
Ohne `-Pscreenshots` ist Paparazzi nicht aktiv; normale Builds und die CI
bleiben davon unberuehrt.

## Versionsnummer

`versionCode` ist die Zahl der Commits, `versionName` zusaetzlich der
Commit-Hash, z. B. `1.0.42 (17fdcec)`. Damit steigt die Nummer mit jedem
Stand, und Android nimmt ein neueres APK als Update an. In der CI braucht es
dafuer die volle Git-Geschichte (`fetch-depth: 0`).

## Signatur

Debug-Builds werden mit `android/app/debug.keystore` signiert. Das ist ein
**bewusst oeffentlicher Testschluessel** mit den Android-Debug-Vorgaben
(Passwort `android`, Alias `androiddebugkey`) und kein Geheimnis. Er sorgt nur
dafuer, dass jeder Build dieselbe Signatur traegt — sonst verlangt jedes
Update eine Deinstallation, und lokal gepufferte Aufnahmen gingen verloren.

Fuer den Einsatz auf Mitarbeitergeraeten oder im Play Store braucht es einen
**eigenen Release-Schluessel**:

- einmal erzeugen, sicher aufbewahren (geht er verloren, sind keine Updates
  mehr moeglich),
- nur als GitHub-Secret hinterlegen, nie im Repository — `.gitignore` sperrt
  `*.jks` und `*.keystore` ausser dem Testschluessel,
- ein Wechsel vom Test- auf den Release-Schluessel verlangt einmalig eine
  Neuinstallation der App.
