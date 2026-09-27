package de.winterfeld.logistik.capture

import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.ui.components.Labels

/**
 * Sprachabfrage: die App fragt die Angaben einzeln nacheinander ab
 * („Lagerplatz“ → Ton → Aufnahme → „Bestand“ → …). Hier steht nur, was
 * gefragt wird und wie eine Antwort gelesen wird — ohne Android, damit es
 * sich testen lässt. Ablauf und Ton: [SprachDialog].
 *
 * [Schritt.ansage] und [Ergebnis.Unklar.ansage] benennen Audiodateien in
 * res/raw (erzeugt mit tools/ansagen_erzeugen.py).
 */
object SprachAbfrage {

    /** Ein Punkt der Abfrage. [feld] null = freie Angaben für die KI (Transkript). */
    data class Schritt(val feld: String?, val titel: String, val ansage: String)

    val SCHRITTE = listOf(
        Schritt("storage_location_spoken", "Lagerplatz", "ansage_lagerplatz"),
        Schritt("stock_quantity", "Bestand", "ansage_bestand"),
        Schritt("condition", "Zustand", "ansage_zustand"),
        Schritt("purchase_price_net", "Einkaufspreis netto", "ansage_einkaufspreis"),
        Schritt(null, "Weitere Angaben", "ansage_weitere"),
    )

    const val ANSAGE_NICHT_VERSTANDEN = "ansage_nicht_verstanden"
    const val ANSAGE_FERTIG = "ansage_fertig"

    sealed interface Ergebnis {
        /** Angabe für ein Feld — geht als Antwort an den Server. */
        data class Antwort(val antwort: AnswerDto, val anzeige: String) : Ergebnis
        /** Freier Text für die KI-Auswertung. */
        data class Freitext(val text: String) : Ergebnis
        /** Nicht verstanden — [ansage] wird abgespielt, [hinweis] angezeigt, dann dieselbe Frage noch einmal. */
        data class Unklar(val hinweis: String, val ansage: String = ANSAGE_NICHT_VERSTANDEN) : Ergebnis
        data object Weiter : Ergebnis
        data object Zurueck : Ergebnis
        data object Fertig : Ergebnis
    }

    private val WEITER = setOf("weiter", "überspringen", "skip", "nächste", "nächster",
                               "weiß nicht", "keine ahnung", "leer", "nichts", "keine", "nein")
    private val ZURUECK = setOf("zurück", "zurueck", "nochmal zurück")
    private val FERTIG = setOf("fertig", "ende", "stopp", "stop", "abbrechen", "beenden")

    /** Gesprochenen Text für [schritt] auslesen. */
    fun lesen(schritt: Schritt, gesprochen: String): Ergebnis {
        val text = gesprochen.trim()
        val klein = text.lowercase().trimEnd('.', '!', '?')
        when {
            klein.isEmpty() -> return Ergebnis.Weiter
            klein in FERTIG -> return Ergebnis.Fertig
            klein in ZURUECK -> return Ergebnis.Zurueck
            klein in WEITER -> return Ergebnis.Weiter
        }
        val feld = schritt.feld ?: return Ergebnis.Freitext(text)
        return when (feld) {
            "stock_quantity" -> zahl(klein)?.let {
                Ergebnis.Antwort(AnswerDto(field = feld, value = it.toString()), "$it Stück")
            } ?: Ergebnis.Unklar("Bitte eine Zahl sagen", "ansage_bitte_zahl")
            "condition" -> zustand(klein)?.let {
                Ergebnis.Antwort(AnswerDto(field = feld, value = it), Labels.zustand(it))
            } ?: Ergebnis.Unklar("Neu, geöffnet, gebraucht oder defekt", "ansage_bitte_zustand")
            "purchase_price_net" -> preis(klein)?.let {
                Ergebnis.Antwort(AnswerDto(field = feld, value = it), Labels.preis(it))
            } ?: Ergebnis.Unklar("Bitte einen Betrag sagen", "ansage_bitte_betrag")
            else -> Ergebnis.Antwort(AnswerDto(field = feld, value = text), text)
        }
    }

    private val ZAHLWORTE = mapOf(
        "null" to 0, "ein" to 1, "eins" to 1, "eine" to 1, "einen" to 1, "zwei" to 2,
        "drei" to 3, "vier" to 4, "fünf" to 5, "sechs" to 6, "sieben" to 7, "acht" to 8,
        "neun" to 9, "zehn" to 10, "elf" to 11, "zwölf" to 12, "dreizehn" to 13,
        "vierzehn" to 14, "fünfzehn" to 15, "sechzehn" to 16, "siebzehn" to 17,
        "achtzehn" to 18, "neunzehn" to 19, "zwanzig" to 20, "dreißig" to 30,
        "vierzig" to 40, "fünfzig" to 50, "hundert" to 100,
    )

    /** „8“, „8 Stück“, „acht“, „ein Stück“ → Zahl; sonst null. */
    fun zahl(text: String): Int? {
        Regex("""\d+""").find(text.replace(".", ""))?.let { return it.value.toIntOrNull() }
        return text.split(Regex("""\s+""")).firstNotNullOfOrNull { ZAHLWORTE[it] }
    }

    /** Zustand in eigenen Worten → Code des Servers. Reihenfolge zählt („neu, geöffnet“ vor „neu“). */
    fun zustand(text: String): String? = when {
        "defekt" in text || "kaputt" in text -> "defective"
        "überholt" in text || "refurbished" in text -> "refurbished"
        "gebraucht" in text || "benutzt" in text -> "used"
        "geöffnet" in text || "offen" in text || "ausgepackt" in text -> "new_opened"
        "neu" in text -> "new"
        else -> null
    }

    /**
     * „12,50“, „12,50 €“, „12 Euro 50“, „zwölf Euro“ → „12.50“ für den Server; sonst null.
     * Die Spracherkennung liefert Beträge meist schon als Ziffern.
     */
    fun preis(text: String): String? {
        val t = text.replace("€", " euro ").replace(Regex("""\s+"""), " ")
        Regex("""(\d+)\s*euro\s*(\d{1,2})\b""").find(t)?.let { m ->
            return Labels.preisEingabe("${m.groupValues[1]},${m.groupValues[2].padStart(2, '0')}")
        }
        Regex("""\d+(?:[.,]\d+)?""").find(t)?.let { m ->
            return runCatching { Labels.preisEingabe(m.value) }.getOrNull()
        }
        return zahl(t)?.let { Labels.preisEingabe(it.toString()) }
    }
}
