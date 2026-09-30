package de.winterfeld.logistik.data.remote.dto

import com.google.gson.annotations.SerializedName

data class LoginRequest(val email: String, val password: String)
data class RefreshRequest(@SerializedName("refresh_token") val refreshToken: String)
data class TokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
    @SerializedName("expires_in") val expiresIn: Int,
)

data class UserDto(
    val id: String,
    val email: String,
    @SerializedName("display_name") val displayName: String,
    val role: String,
)

data class CaptureCreateRequest(
    @SerializedName("client_capture_id") val clientCaptureId: String,
    @SerializedName("quick_mode") val quickMode: Boolean = false,
)

data class ImageDto(
    val id: String,
    val kind: String,
    val role: String,
    val url: String?,
    @SerializedName("is_primary") val isPrimary: Boolean,
)

data class QuestionDto(
    val id: String,
    val text: String,
    val field: String?,
    val kind: String,
    val options: List<Any>?,
)

data class ProductDto(
    val id: String,
    @SerializedName("internal_sku") val internalSku: String,
    val ean: String?,
    val mpn: String?,
    val manufacturer: String?,
    val brand: String?,
    @SerializedName("product_name") val productName: String?,
    val model: String?,
    val category: String?,
    val condition: String,
    @SerializedName("packaging_condition") val packagingCondition: String?,
    @SerializedName("purchase_price_net") val purchasePriceNet: String?,
    @SerializedName("sale_price") val salePrice: String?,
    @SerializedName("recommended_sale_price") val recommendedSalePrice: String?,
    @SerializedName("lowest_market_price") val lowestMarketPrice: String?,
    @SerializedName("highest_market_price") val highestMarketPrice: String?,
    @SerializedName("average_market_price") val averageMarketPrice: String?,
    @SerializedName("stock_quantity") val stockQuantity: Int,
    @SerializedName("available_quantity") val availableQuantity: Int,
    @SerializedName("supplier_name") val supplierName: String?,
    @SerializedName("storage_location_code") val storageLocationCode: String?,
    val notes: String?,
    // Lebensmittel & Getränke (alle optional; ältere Server liefern sie nicht)
    @SerializedName("net_content_amount") val netContentAmount: String? = null,
    @SerializedName("net_content_unit") val netContentUnit: String? = null,
    @SerializedName("units_per_pack") val unitsPerPack: Int? = null,
    @SerializedName("deposit_amount") val depositAmount: String? = null,
    @SerializedName("deposit_type") val depositType: String? = null,
    val ingredients: String? = null,
    val allergens: String? = null,
    @SerializedName("food_notes") val foodNotes: String? = null,
    @SerializedName("voice_transcript") val voiceTranscript: String?,
    @SerializedName("field_confidence") val fieldConfidence: Map<String, Double>?,
    @SerializedName("field_sources") val fieldSources: Map<String, String>?,
    @SerializedName("open_questions") val openQuestions: List<QuestionDto>?,
    /** Gewählte Vertriebskanäle (IDs der Shop-Verbindungen); ältere Server liefern nichts. */
    val kanaele: List<String>? = null,
    @SerializedName("research_candidates") val researchCandidates: List<Map<String, Any?>>?,
    @SerializedName("processing_status") val processingStatus: String,
    @SerializedName("publication_status") val publicationStatus: String,
    val images: List<ImageDto>?,
)

data class PageDto<T>(val items: List<T>, val total: Int)

data class AnswerDto(
    @SerializedName("question_id") val questionId: String? = null,
    val field: String? = null,
    val value: Any? = null,
    @SerializedName("selected_candidate_index") val selectedCandidateIndex: Int? = null,
)

data class AnswersRequest(val answers: List<AnswerDto>)

data class DuplicateDto(
    @SerializedName("product_id") val productId: String,
    @SerializedName("internal_sku") val internalSku: String,
    @SerializedName("product_name") val productName: String?,
    val ean: String?,
    @SerializedName("stock_quantity") val stockQuantity: Int,
    @SerializedName("storage_location_code") val storageLocationCode: String?,
    @SerializedName("match_reason") val matchReason: String,
    @SerializedName("primary_image_url") val primaryImageUrl: String?,
)

data class ConfirmResultDto(
    val status: String,                       // saved | duplicate_found | stock_increased
    val product: ProductDto?,
    val duplicates: List<DuplicateDto>?,
)

data class DashboardDto(
    @SerializedName("products_today") val productsToday: Int,
    @SerializedName("products_total") val productsTotal: Int,
    @SerializedName("review_required") val reviewRequired: Int,
    @SerializedName("shop_ready") val shopReady: Int,
    val published: Int,
)

data class SupplierDto(val id: String, val name: String)
data class LocationDto(val id: String, val code: String, val kind: String, val name: String)
data class PatchProductRequest(val fields: Map<String, Any?>)

data class ClientErrorDto(
    val kind: String,
    @SerializedName("app_version") val appVersion: String,
    val device: String,
    val report: String,
)


/** Ein Vertriebskanal: eigener Shop, eBay, Amazon, Kleinanzeigen … */
data class KanalDto(
    val id: String,
    val name: String,
    @SerializedName("connector_type") val connectorType: String,
    val portal: String,
    /** Ohne Schnittstelle – wird im Lager-Web vorbereitet und von Hand eingestellt. */
    val manuell: Boolean,
    /** Aufschlag in Prozent auf den Verkaufspreis (Provision des Portals), z. B. "12.00". */
    @SerializedName("preis_aufschlag") val preisAufschlag: String? = null,
    /** Preise auf ,99 aufrunden. */
    @SerializedName("preis_runden") val preisRunden: Boolean? = null,
    /** Preis des Artikels auf diesem Kanal (nur mit product_id abgefragt). */
    val preis: String? = null,
    /** Fester Preis für diesen Kanal, sonst null (= Verkaufspreis + Aufschlag). */
    @SerializedName("preis_fest") val preisFest: String? = null,
)

data class KanaeleRequest(
    @SerializedName("connection_ids") val connectionIds: List<String>,
    /** Fester Preis je Kanal; "" = wieder Verkaufspreis + Aufschlag. null = unverändert. */
    val preise: Map<String, String>? = null,
)
