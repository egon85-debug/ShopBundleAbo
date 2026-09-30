package de.winterfeld.logistik

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import de.winterfeld.logistik.data.remote.dto.ConfirmResultDto
import de.winterfeld.logistik.data.remote.dto.KanalDto
import de.winterfeld.logistik.data.remote.dto.KanaeleRequest
import de.winterfeld.logistik.data.remote.dto.ProductDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DtoSerializationTest {

    private val gson = Gson()

    @Test
    fun `product dto parses backend response`() {
        val json = """{
            "id": "abc", "internal_sku": "WL-000245", "ean": "4059952529776",
            "product_name": "Bosch GSR 12V-35", "condition": "new",
            "sale_price": "59.00", "stock_quantity": 14, "available_quantity": 13,
            "field_confidence": {"ean": 0.99}, "field_sources": {"ean": "ai"},
            "processing_status": "review_required", "publication_status": "draft"
        }"""
        val product = gson.fromJson(json, ProductDto::class.java)
        assertEquals("WL-000245", product.internalSku)
        assertEquals("59.00", product.salePrice)
        assertEquals(14, product.stockQuantity)
        assertEquals(0.99, product.fieldConfidence?.get("ean")!!, 0.001)
    }

    @Test
    fun `confirm result with duplicates parses`() {
        val json = """{
            "status": "duplicate_found",
            "duplicates": [{"product_id": "x", "internal_sku": "WL-000001",
                            "product_name": "A", "ean": null, "stock_quantity": 5,
                            "storage_location_code": "H2/B4",
                            "match_reason": "Gleiche EAN"}]
        }"""
        val result = gson.fromJson(json, ConfirmResultDto::class.java)
        assertEquals("duplicate_found", result.status)
        assertEquals("Gleiche EAN", result.duplicates?.first()?.matchReason)
    }

    @Test
    fun `vertriebskanaele werden gelesen und gesendet`() {
        val liste: List<KanalDto> = gson.fromJson(
            """[{"id": "k1", "name": "Kleinanzeigen", "connector_type": "kleinanzeigen",
                 "portal": "Kleinanzeigen", "manuell": true}]""",
            object : TypeToken<List<KanalDto>>() {}.type)
        assertEquals("kleinanzeigen", liste.single().connectorType)
        assertTrue(liste.single().manuell)

        val mitKanaelen = gson.fromJson("""{"id": "a", "internal_sku": "WL-1", "condition": "new",
            "stock_quantity": 1, "available_quantity": 1, "processing_status": "draft",
            "publication_status": "draft", "kanaele": ["k1", "k2"]}""", ProductDto::class.java)
        assertEquals(listOf("k1", "k2"), mitKanaelen.kanaele)
        // Ältere Server liefern das Feld nicht.
        val ohne = gson.fromJson("""{"id": "a", "internal_sku": "WL-1", "condition": "new",
            "stock_quantity": 1, "available_quantity": 1, "processing_status": "draft",
            "publication_status": "draft"}""", ProductDto::class.java)
        assertNull(ohne.kanaele)

        assertEquals("""{"connection_ids":["k1"]}""", gson.toJson(KanaeleRequest(listOf("k1"))))
    }
}
