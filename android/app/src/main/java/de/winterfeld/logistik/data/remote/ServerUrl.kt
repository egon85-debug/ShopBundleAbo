package de.winterfeld.logistik.data.remote

import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/**
 * Die Server-Adresse wird auf dem Geraet von Hand eingetippt. Handytastaturen
 * haengen gern ein Leerzeichen oder einen Schraegstrich an, und "https://"
 * laesst man leicht weg. Ungeprueft uebernommen wird daraus "…de//api/v1"
 * (404) oder eine Ausnahme ohne verstaendliche Meldung.
 */
object ServerUrl {

    fun normalize(input: String): String {
        var url = input.trim()
        if (url.isEmpty()) return url
        val hatSchema = url.startsWith("https://", ignoreCase = true) ||
            url.startsWith("http://", ignoreCase = true)
        if (!hatSchema) url = "https://$url"
        url = url.trimEnd('/')
        // Wer den API-Pfad mit eintippt: den haengt der Client selbst an.
        if (url.endsWith("/api/v1", ignoreCase = true)) {
            url = url.dropLast("/api/v1".length).trimEnd('/')
        }
        return url
    }

    /** Was beim Anmelden schiefging — in Worten, die jemand im Lager versteht. */
    fun anmeldeFehler(e: Throwable): String = when (e) {
        is HttpException -> when (e.code()) {
            401 -> "E-Mail oder Passwort falsch."
            403 -> "Dieses Konto ist gesperrt."
            404 -> "Unter dieser Adresse läuft kein Winterfeld-Server. Adresse prüfen."
            429 -> "Zu viele Versuche. Bitte eine Minute warten."
            in 500..599 -> "Der Server hat einen Fehler gemeldet (${e.code()}). Später erneut versuchen."
            else -> "Anmeldung abgelehnt (${e.code()})."
        }
        is UnknownHostException -> "Server nicht gefunden. Adresse und Internetverbindung prüfen."
        is SSLException -> "Keine sichere Verbindung möglich. Adresse prüfen (https://…)."
        is ConnectException, is SocketTimeoutException ->
            "Server nicht erreichbar. Internetverbindung prüfen."
        is IllegalArgumentException -> "Die Server-Adresse ist ungültig."
        is IOException -> "Verbindungsproblem: ${e.message ?: "unbekannt"}"
        else -> "Anmeldung fehlgeschlagen: ${e.message ?: e.javaClass.simpleName}"
    }
}
