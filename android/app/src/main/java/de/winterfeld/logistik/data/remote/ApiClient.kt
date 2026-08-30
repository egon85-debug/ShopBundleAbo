package de.winterfeld.logistik.data.remote

import com.google.gson.Gson
import de.winterfeld.logistik.data.remote.dto.RefreshRequest
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * OkHttp/Retrofit-Aufbau: hängt das Access-Token an und erneuert es bei 401
 * synchron über den Refresh-Token (Rotation — neuer Refresh wird gespeichert).
 */
class ApiClient(private val tokenStore: TokenStore) {

    @Volatile private var cached: Pair<String, ApiService>? = null

    fun service(): ApiService {
        val baseUrl = tokenStore.baseUrl.ifEmpty { "http://10.0.2.2:8000" }
        cached?.let { (url, service) -> if (url == baseUrl) return service }
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor())
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .build()
        val service = Retrofit.Builder()
            .baseUrl("$baseUrl/api/v1/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
        cached = baseUrl to service
        return service
    }

    private inner class AuthInterceptor : Interceptor {
        private val gson = Gson()

        override fun intercept(chain: Interceptor.Chain): Response {
            val request = withAuth(chain.request())
            var response = chain.proceed(request)
            if (response.code == 401 && !request.url.encodedPath.contains("/auth/")) {
                synchronized(this@ApiClient) {
                    if (refreshBlocking()) {
                        response.close()
                        response = chain.proceed(withAuth(chain.request()))
                    }
                }
            }
            return response
        }

        private fun withAuth(request: Request): Request {
            val token = tokenStore.accessToken ?: return request
            return request.newBuilder().header("Authorization", "Bearer $token").build()
        }

        private fun refreshBlocking(): Boolean {
            val refresh = tokenStore.refreshToken ?: return false
            val baseUrl = tokenStore.baseUrl.ifEmpty { "http://10.0.2.2:8000" }
            val body = gson.toJson(RefreshRequest(refresh))
                .toRequestBody("application/json".toMediaType())
            val request = Request.Builder().url("$baseUrl/api/v1/auth/refresh").post(body).build()
            return try {
                OkHttpClient().newCall(request).execute().use { res ->
                    if (!res.isSuccessful) {
                        if (res.code == 401) tokenStore.clearTokens()
                        return false
                    }
                    val tokens = gson.fromJson(res.body?.string(),
                        de.winterfeld.logistik.data.remote.dto.TokenResponse::class.java)
                    tokenStore.accessToken = tokens.accessToken
                    tokenStore.refreshToken = tokens.refreshToken
                    true
                }
            } catch (_: Exception) {
                false
            }
        }
    }
}
