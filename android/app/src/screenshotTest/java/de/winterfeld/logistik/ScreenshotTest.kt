package de.winterfeld.logistik

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import de.winterfeld.logistik.data.remote.dto.DashboardDto
import de.winterfeld.logistik.data.remote.dto.ImageDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.remote.dto.QuestionDto
import de.winterfeld.logistik.ui.screens.DashboardContent
import de.winterfeld.logistik.ui.screens.ProductDetailContent
import de.winterfeld.logistik.ui.screens.ProductListContent
import de.winterfeld.logistik.ui.screens.SyncContent
import de.winterfeld.logistik.ui.theme.WinterfeldTheme
import org.junit.Rule
import org.junit.Test

/**
 * Rendert die wichtigsten Bildschirme in Handygröße, um das Layout ohne Gerät
 * anzusehen (nur mit -Pscreenshots, siehe app/build.gradle.kts).
 */
class ScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5.copy(softButtons = false))

    private fun screen(content: @Composable () -> Unit) = paparazzi.snapshot {
        WinterfeldTheme {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Box(Modifier.fillMaxSize()) { content() }
            }
        }
    }

    @Test fun startseite() = screen {
        DashboardContent(DashboardDto(3, 27, 4, 2, 0), offline = false, pendingCount = 0,
                         quickMode = false, onQuickModeChange = {}, onStartCapture = {},
                         onNavigate = {})
    }

    @Test fun startseiteOfflineMitWarteschlange() = screen {
        DashboardContent(null, offline = true, pendingCount = 3, quickMode = true,
                         onQuickModeChange = {}, onStartCapture = {}, onNavigate = {})
    }

    @Test fun artikelliste() = screen {
        ProductListContent(
            query = "", onQueryChange = {}, filter = null, onFilterChange = {},
            items = listOf(
                produkt("1", "Bosch Professional Akku-Bohrschrauber GSR 18V-55 mit 2 Akkus",
                        "review_required", lagerplatz = "A-01-03"),
                produkt("2", null, "review_required"),
                produkt("3", "Makita DHP484Z", "shop_ready", lagerplatz = "B-02-01"),
                produkt("4", "Fischer Dübel SX 8 × 40, 100 Stück", "published",
                        veroeffentlicht = true),
            ),
            total = 27, loading = false, error = null, baseUrl = "https://x",
            onBack = {}, onOpen = {}, onReload = {}, onLoadMore = {},
        )
    }

    /** Ganze Seite am Stück, damit auch die unteren Abschnitte zu sehen sind. */
    private fun lang() = paparazzi.unsafeUpdateConfig(
        DeviceConfig.PIXEL_5.copy(softButtons = false, screenHeight = 4600))

    @Test fun startseiteGrosseSchrift() {
        paparazzi.unsafeUpdateConfig(DeviceConfig.PIXEL_5.copy(softButtons = false,
                                                               fontScale = 1.3f))
        screen {
            DashboardContent(DashboardDto(3, 27, 4, 2, 0), offline = false, pendingCount = 12,
                             quickMode = false, onQuickModeChange = {}, onStartCapture = {},
                             onNavigate = {})
        }
    }

    @Test fun artikelDetail() = lang().let { screen {
        ProductDetailContent(
            produkt("1", "Bosch Professional Akku-Bohrschrauber GSR 18V-55", "review_required",
                    lagerplatz = "A-01-03", fragen = listOf(
                        QuestionDto("q1", "Ich habe keinen Bestand erkannt. Wie viele Stück " +
                                    "sind vorhanden?", "stock_quantity", "number", null))),
            baseUrl = "https://x", error = null, onEdit = {}, onQuestion = {},
            onUseRecommended = {},
        )
    } }

    @Test fun artikelDetailOhneErkennung() = screen {
        ProductDetailContent(
            produkt("2", null, "review_required", fragen = listOf(
                QuestionDto("q1", "Ich konnte den Artikel nicht erkennen. Wie heißt er?",
                            "product_name", "text", null))),
            baseUrl = "https://x", error = null, onEdit = {}, onQuestion = {},
            onUseRecommended = {},
        )
    }

    @Test fun synchronisierung() = screen {
        SyncContent(emptyList(), pendingCaptures = 0, onBack = {}, onRetry = {})
    }

    private fun produkt(
        id: String, name: String?, status: String, lagerplatz: String? = null,
        veroeffentlicht: Boolean = false, fragen: List<QuestionDto> = emptyList(),
    ) = ProductDto(
        id = id, internalSku = "WL-2026-00$id", ean = if (name != null) "4059952513447" else null,
        mpn = null, manufacturer = name?.substringBefore(' '), brand = null,
        productName = name, model = null, category = if (name != null) "Werkzeug" else null,
        condition = "new", packagingCondition = null, purchasePriceNet = "89.9",
        salePrice = if (name != null) "149" else null, recommendedSalePrice = "139.00",
        lowestMarketPrice = "119.00", highestMarketPrice = "169.99", averageMarketPrice = "142.50",
        stockQuantity = if (fragen.any { it.field == "stock_quantity" }) 0 else 2,
        availableQuantity = 2, supplierName = "Werkzeug Müller", storageLocationCode = lagerplatz,
        notes = null, voiceTranscript = "zwei Stück, neu, Einkauf 89,90 netto",
        fieldConfidence = mapOf("category" to 0.6), fieldSources = mapOf("ean" to "user"),
        openQuestions = fragen, researchCandidates = null, processingStatus = status,
        publicationStatus = if (veroeffentlicht) "published" else "draft",
        images = listOf(ImageDto("i$id", "original", "front", "/api/v1/media/x.jpg", true)),
    )
}
