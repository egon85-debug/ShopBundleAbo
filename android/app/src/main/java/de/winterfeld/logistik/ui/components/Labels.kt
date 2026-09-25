package de.winterfeld.logistik.ui.components

import de.winterfeld.logistik.data.remote.dto.ImageDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import java.math.BigDecimal
import java.util.Locale

/**
 * Deutsche Anzeige für die Werte, die der Server als Schlüssel liefert
 * (Status, Zustand), und kleine Formatierhilfen. Reines Kotlin, damit es sich
 * ohne Gerät testen lässt.
 */
object Labels {

    val ZUSTAENDE = listOf(
        "new" to "Neu", "new_opened" to "Neu, geöffnet", "refurbished" to "Generalüberholt",
        "used" to "Gebraucht", "defective" to "Defekt", "unknown" to "Unbekannt",
    )

    fun zustand(value: String?): String =
        ZUSTAENDE.firstOrNull { it.first == value }?.second ?: value ?: "–"

    /** Kurzer Status für Liste und Kopfzeile; Veröffentlichung schlägt Bearbeitung. */
    fun status(product: ProductDto): Status = when {
        product.publicationStatus == "published" -> Status("Veröffentlicht", Ton.GUT)
        product.publicationStatus == "publish_failed" -> Status("Shop-Fehler", Ton.FEHLER)
        else -> when (product.processingStatus) {
            "draft", "photo_uploaded" -> Status("Entwurf", Ton.NEUTRAL)
            "recognition_running", "product_identified", "price_research_running",
            "images_optimizing", "shoptext_generating" -> Status("In Arbeit", Ton.NEUTRAL)
            "review_required" -> Status("Zu prüfen", Ton.WARNUNG)
            "shop_ready" -> Status("Shopbereit", Ton.GUT)
            "published" -> Status("Veröffentlicht", Ton.GUT)
            "error" -> Status("Fehler", Ton.FEHLER)
            else -> Status(product.processingStatus, Ton.NEUTRAL)
        }
    }

    data class Status(val text: String, val ton: Ton)
    enum class Ton { NEUTRAL, WARNUNG, GUT, FEHLER }

    /** "12.5" → "12,50 €"; leer oder unlesbar → "–". */
    fun preis(value: String?): String {
        val zahl = value?.toBigDecimalOrNull() ?: return "–"
        return String.format(Locale.GERMANY, "%,.2f €", zahl)
    }

    /**
     * Preis-Eingabe vom Handy in das Format des Servers: Komma oder Punkt,
     * optional mit €. Leere Eingabe heißt "Feld leeren" (null).
     * Wirft [IllegalArgumentException] bei allem, was keine Zahl ist.
     */
    fun preisEingabe(text: String): String? {
        val bereinigt = text.replace("€", "").replace(" ", "").trim()
        if (bereinigt.isEmpty()) return null
        // "1.234,50" (deutsch) → Tausenderpunkte weg, Komma wird Punkt.
        val normal = if (bereinigt.contains(','))
            bereinigt.replace(".", "").replace(',', '.') else bereinigt
        val zahl = normal.toBigDecimalOrNull()
            ?: throw IllegalArgumentException("Bitte eine Zahl eingeben, z. B. 12,50")
        require(zahl >= BigDecimal.ZERO) { "Der Preis darf nicht negativ sein" }
        return zahl.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()
    }

    /** Bild-URLs kommen je nach Speicher absolut oder als Pfad auf dem Server. */
    fun bildUrl(baseUrl: String, url: String?): String? = when {
        url.isNullOrBlank() -> null
        url.startsWith("http://") || url.startsWith("https://") -> url
        else -> baseUrl.trimEnd('/') + "/" + url.trimStart('/')
    }

    /** Vorschaubild: das Hauptbild, bearbeitete Fassung vor dem Original. */
    fun vorschaubild(images: List<ImageDto>?): ImageDto? {
        val alle = images.orEmpty().filter { !it.url.isNullOrBlank() }
        return alle.firstOrNull { it.isPrimary && it.kind == "optimized" }
            ?: alle.firstOrNull { it.isPrimary }
            ?: alle.firstOrNull { it.kind == "optimized" }
            ?: alle.firstOrNull()
    }

    /** Bilder für die Detailansicht: Hauptbild zuerst, Originale vor Bearbeitungen. */
    fun galerie(images: List<ImageDto>?): List<ImageDto> =
        images.orEmpty().filter { !it.url.isNullOrBlank() }
            .sortedWith(compareByDescending<ImageDto> { it.isPrimary }
                .thenBy { if (it.kind == "original") 0 else 1 })
}
