package de.winterfeld.logistik.data.remote

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.KeyStore

/**
 * Verschlüsselte Ablage von Tokens und Server-URL. Keine API-Keys im Client!
 * Tests reichen einfache SharedPreferences hinein (ohne Android-Schlüsselspeicher).
 */
class TokenStore(private val prefs: SharedPreferences) {

    constructor(context: Context) : this(oeffnen(
        erstellen = { verschluesselt(context) },
        zuruecksetzen = { zuruecksetzen(context) },
    ))

    companion object {
        private const val DATEI = "winterfeld_secure"

        /**
         * Öffnet die Ablage; lässt sie sich nicht entschlüsseln, wird sie neu
         * angelegt. Das passiert, wenn die Datei zum Schlüssel im Android-
         * Schlüsselspeicher nicht mehr passt — typisch nach einer Wiederherstellung
         * aus einem Backup (die Datei kommt zurück, der Schlüssel verlässt das
         * Gerät nie) oder wenn der Hersteller den Schlüsselspeicher geleert hat.
         * Dann würde die App sonst bei jedem Start abstürzen (AEADBadTagException).
         * Verloren geht nur die Anmeldung; Aufnahmen liegen in der Datenbank.
         */
        internal fun oeffnen(erstellen: () -> SharedPreferences,
                             zuruecksetzen: () -> Unit): SharedPreferences =
            try {
                erstellen()
            } catch (e: Exception) {
                Log.w("TokenStore", "Anmeldedaten unlesbar, lege neu an", e)
                zuruecksetzen()
                erstellen()
            }

        private fun verschluesselt(context: Context): SharedPreferences =
            EncryptedSharedPreferences.create(
                context,
                DATEI,
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )

        private fun zuruecksetzen(context: Context) {
            context.deleteSharedPreferences(DATEI)
            runCatching {
                KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                    .deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            }
        }
    }

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

    /**
     * Auf Wunsch gemerkte Anmeldedaten (Knopf auf dem Anmeldebildschirm).
     * Liegen wie die Tokens nur in dieser verschlüsselten Ablage; der Schlüssel
     * dafür verlässt den Android-Schlüsselspeicher nie.
     */
    val gespeicherteEmail: String? get() = prefs.getString("login_email", null)
    val gespeichertesPasswort: String? get() = prefs.getString("login_passwort", null)

    fun anmeldedatenMerken(email: String, passwort: String) {
        prefs.edit().putString("login_email", email).putString("login_passwort", passwort).apply()
    }

    fun anmeldedatenVergessen() {
        prefs.edit().remove("login_email").remove("login_passwort").apply()
    }

    fun clearTokens() {
        prefs.edit().remove("access_token").remove("refresh_token").apply()
    }
}
