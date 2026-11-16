plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// Versionsnummer aus der Git-Geschichte: steigt mit jedem Commit, lokal wie in
// der CI gleich. Android installiert ein APK nur als Update, wenn die Nummer
// nicht kleiner ist als die installierte — und so laesst sich am Geraet
// ablesen, welcher Stand laeuft. Ohne Git (z. B. Quellarchiv) gilt 1.
val gitCommitCount: Int = runCatching {
    providers.exec { commandLine("git", "rev-list", "--count", "HEAD") }
        .standardOutput.asText.get().trim().toInt()
}.getOrDefault(1)
val gitShortSha: String = runCatching {
    providers.exec { commandLine("git", "rev-parse", "--short", "HEAD") }
        .standardOutput.asText.get().trim()
}.getOrDefault("ohne-git")

android {
    namespace = "de.winterfeld.logistik"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.winterfeld.logistik"
        minSdk = 26
        targetSdk = 35
        versionCode = gitCommitCount
        versionName = "1.0.$gitCommitCount ($gitShortSha)"

        // Vorgabe im Anmeldebildschirm; fuer einen anderen Server beim Bauen
        // mit -PserverUrl=https://… ueberschreiben.
        val serverUrl = (project.findProperty("serverUrl") as String?)
            ?: "https://lager.winterfeld-logistik.de"
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$serverUrl\"")

        // Nur ARM: das sind alle Handys und Tablets ab Android 8. x86 laeuft
        // nur auf Emulatoren am PC und brachte 11 MB Maschinencode mit (die
        // Barcode-Erkennung liefert je Prozessortyp eine eigene Bibliothek).
        // Fuer einen Emulator bauen: -PalleAbis
        if (!project.hasProperty("alleAbis")) {
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        }
    }

    signingConfigs {
        // Fester Testschluessel fuer Debug-Builds. Er ist KEIN Geheimnis: die
        // Werte sind die ueblichen Android-Debug-Vorgaben, und ein Debug-Build
        // ist ohnehin nicht fuer die Veroeffentlichung gedacht. Er sorgt nur
        // dafuer, dass jeder Build — hier wie in der CI — dieselbe Signatur
        // traegt und sich ueber die installierte Version aktualisieren laesst.
        // Ohne ihn erzeugt jede Maschine einen eigenen Zufallsschluessel, und
        // jedes Update verlangt eine Deinstallation samt lokal gepufferter
        // Aufnahmen.
        //
        // Release-Builds brauchen einen eigenen, geheimen Schluessel, der nie
        // ins Repository gehoert (siehe docs/android-build.md).
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"),
                          "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    // Robolectric braucht die Android-Ressourcen, um die App auf der JVM zu starten.
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { it.maxHeapSize = "2g" }
    }
}

// Bildschirmfotos der Oberflaeche ohne Handy oder Emulator (Paparazzi rendert
// die Compose-Screens auf der JVM). Nur bei Bedarf, damit normale Builds und
// die CI nichts davon mitschleppen:
//   ./gradlew -Pscreenshots :app:recordPaparazziDebug
// Die Bilder landen in app/src/test/snapshots/images/.
if (project.hasProperty("screenshots")) {
    apply(plugin = "app.cash.paparazzi")
    android.sourceSets["test"].java.srcDir("src/screenshotTest/java")
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.03")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.navigation:navigation-compose:2.8.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    // Artikelbilder in Liste und Detailansicht
    implementation("io.coil-kt:coil-compose:2.7.0")

    // Kamera + Barcode
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    // Lokale Datenbank + Hintergrund-Sync
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Netzwerk
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-gson:3.0.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Sichere Token-/Konfigurationsablage
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    testImplementation("junit:junit:4.13.2")
    // Ganze App ohne Geraet durchklicken: Robolectric + Compose-Test gegen
    // einen nachgebauten Server (MockWebServer mit echten Server-Antworten)
    testImplementation(composeBom)
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("androidx.work:work-testing:2.9.1")
    testImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation(composeBom)
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
