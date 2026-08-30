package de.winterfeld.logistik.data.remote

import de.winterfeld.logistik.data.remote.dto.AnswersRequest
import de.winterfeld.logistik.data.remote.dto.CaptureCreateRequest
import de.winterfeld.logistik.data.remote.dto.ConfirmResultDto
import de.winterfeld.logistik.data.remote.dto.DashboardDto
import de.winterfeld.logistik.data.remote.dto.LocationDto
import de.winterfeld.logistik.data.remote.dto.LoginRequest
import de.winterfeld.logistik.data.remote.dto.PageDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.remote.dto.RefreshRequest
import de.winterfeld.logistik.data.remote.dto.SupplierDto
import de.winterfeld.logistik.data.remote.dto.TokenResponse
import de.winterfeld.logistik.data.remote.dto.UserDto
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    // Auth
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenResponse

    @GET("auth/me")
    suspend fun me(): UserDto

    // Erfassung
    @POST("captures")
    suspend fun createCapture(@Body body: CaptureCreateRequest): ProductDto

    @GET("captures/{id}")
    suspend fun getCapture(@Path("id") id: String): ProductDto

    @Multipart
    @POST("captures/{id}/images")
    suspend fun uploadImage(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Part("role") role: RequestBody,
        @Part("client_image_id") clientImageId: RequestBody,
    ): ProductDto

    @Multipart
    @POST("captures/{id}/voice")
    suspend fun sendTranscript(
        @Path("id") id: String,
        @Part("transcript") transcript: RequestBody,
    ): ProductDto

    @POST("captures/{id}/answers")
    suspend fun sendAnswers(@Path("id") id: String, @Body body: AnswersRequest): ProductDto

    @POST("captures/{id}/confirm")
    suspend fun confirm(
        @Path("id") id: String,
        @Query("duplicate_action") duplicateAction: String? = null,
        @Query("duplicate_id") duplicateId: String? = null,
    ): ConfirmResultDto

    // Produkte & Stammdaten
    @GET("products")
    suspend fun products(
        @Query("q") query: String? = null,
        @Query("status") status: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
    ): PageDto<ProductDto>

    @GET("products/{id}")
    suspend fun product(@Path("id") id: String): ProductDto

    @PATCH("products/{id}")
    suspend fun patchProduct(@Path("id") id: String, @Body fields: Map<String, @JvmSuppressWildcards Any?>): ProductDto

    @GET("dashboard")
    suspend fun dashboard(): DashboardDto

    @GET("suppliers")
    suspend fun suppliers(): List<SupplierDto>

    @GET("storage-locations")
    suspend fun storageLocations(): List<LocationDto>
}
