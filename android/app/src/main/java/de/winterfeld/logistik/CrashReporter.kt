package de.winterfeld.logistik

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Fehlerberichte vom Handy, ohne Kabel und ohne Entwicklertools.
 *
 * - Stürzt die App ab, schreibt [install] den Stacktrace in eine Datei.
 * - Friert sie ein (Android beendet sie nach "App reagiert nicht"), liest
 *   [offeneBerichte] ab Android 11 den Grund aus dem System nach.
 * Beim nächsten Start schickt die App die Berichte an den Server
 * (POST /client-errors), dort stehen sie im Log. Sie enthalten nur den
 * Programmablauf, Version und Gerät — keine Tokens, keine Eingaben.
 */
object CrashReporter {

    private const val DATEI = "absturzbericht.txt"
    private const val PREFS = "absturzberichte"
    private const val ZULETZT = "zuletzt_gemeldet"
    private const val MAX_ZEICHEN = 60_000

    data class Bericht(val art: String, val text: String, val zeitpunkt: Long)

    fun geraet(): String =
        "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} " +
            "(SDK ${Build.VERSION.SDK_INT})"

    fun install(context: Context) {
        val datei = File(context.applicationContext.filesDir, DATEI)
        val vorher = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, fehler ->
            runCatching {
                datei.writeText("Thread: ${thread.name}\n\n${fehler.stackTraceToString()}"
                    .take(MAX_ZEICHEN))
            }
            vorher?.uncaughtException(thread, fehler)
        }
    }

    /** Alles, was seit der letzten Meldung passiert ist — älteste zuerst. */
    fun offeneBerichte(context: Context): List<Bericht> {
        val berichte = mutableListOf<Bericht>()
        val datei = File(context.filesDir, DATEI)
        if (datei.exists()) {
            berichte += Bericht("crash", datei.readText(), datei.lastModified())
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            berichte += systemBerichte(context, zuletztGemeldet(context))
        }
        return berichte.sortedBy { it.zeitpunkt }
    }

    fun gemeldet(context: Context, berichte: List<Bericht>) {
        File(context.filesDir, DATEI).delete()
        val neuester = berichte.maxOfOrNull { it.zeitpunkt } ?: return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(ZULETZT, maxOf(neuester, zuletztGemeldet(context))).apply()
    }

    private fun zuletztGemeldet(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(ZULETZT, 0L)

    /** Einfrieren (ANR) und Abstürze, die Android selbst protokolliert hat. */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.R)
    private fun systemBerichte(context: Context, seit: Long): List<Bericht> {
        val am = context.getSystemService(ActivityManager::class.java) ?: return emptyList()
        val infos = runCatching {
            am.getHistoricalProcessExitReasons(context.packageName, 0, 5)
        }.getOrDefault(emptyList())
        return infos.filter { it.timestamp > seit }.mapNotNull { info ->
            val art = when (info.reason) {
                ApplicationExitInfo.REASON_ANR -> "anr"
                ApplicationExitInfo.REASON_CRASH -> "crash"
                ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash_native"
                else -> return@mapNotNull null
            }
            val zeit = SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.GERMANY)
                .format(Date(info.timestamp))
            val spur = if (art == "anr") runCatching {
                info.traceInputStream?.bufferedReader()?.use { hauptThread(it.readText()) }
            }.getOrNull() else null
            Bericht(art, "Von Android gemeldet am $zeit: ${info.description ?: art}\n\n" +
                        (spur ?: ""), info.timestamp)
        }
    }

    /** Aus dem ANR-Protokoll aller Threads nur den Hauptthread — dort hängt es. */
    internal fun hauptThread(protokoll: String): String {
        val start = protokoll.indexOf("\"main\"")
        if (start < 0) return protokoll.take(MAX_ZEICHEN)
        val ende = protokoll.indexOf("\n\n", start).let { if (it < 0) protokoll.length else it }
        return protokoll.substring(start, ende).take(MAX_ZEICHEN)
    }
}
