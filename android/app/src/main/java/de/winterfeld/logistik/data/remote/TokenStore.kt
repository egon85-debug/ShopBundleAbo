package de.winterfeld.logistik.data.remote

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Verschlüsselte Ablage von Tokens und Server-URL. Keine API-Keys im Client!
 * Tests reichen einfache SharedPreferences hinein (ohne Android-Schlüsselspeicher).
 */
class TokenStore(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(EncryptedSharedPreferences.create(
        context,
        "winterfeld_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    ))

    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(value) = prefs.edit().putString("access_token", value).apply()

    var refreshToken: String?
        get() = prefs.getString("refresh_token", null)
        set(value) = prefs.edit().putString("refresh_token", value).apply()

    var baseUrl: String
        get() = prefs.getString("base_url", "") ?: ""
        set(value) = prefs.edit().putString("base_url", value.trim().trimEnd('/')).apply()

    val isLoggedIn: Boolean get() = refreshToken != null

    fun clearTokens() {
        prefs.edit().remove("access_token").remove("refresh_token").apply()
    }
}
