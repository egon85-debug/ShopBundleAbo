package de.winterfeld.logistik

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import de.winterfeld.logistik.data.remote.TokenStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import javax.crypto.AEADBadTagException

@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [35])
class TokenStoreTest {

    private val prefs = ApplicationProvider.getApplicationContext<Context>()
        .getSharedPreferences("t", Context.MODE_PRIVATE)

    @Test
    fun `unlesbare Ablage wird neu angelegt statt die App abstuerzen zu lassen`() {
        var versuche = 0
        var zurueckgesetzt = 0
        val ergebnis = TokenStore.oeffnen(
            erstellen = {
                versuche++
                // So sah der Absturz auf dem Xiaomi (Android 16) aus
                if (versuche == 1) throw java.io.IOException(AEADBadTagException()) else prefs
            },
            zuruecksetzen = { zurueckgesetzt++ },
        )
        assertSame(prefs, ergebnis)
        assertEquals(2, versuche)
        assertEquals(1, zurueckgesetzt)
    }

    @Test
    fun `lesbare Ablage bleibt unangetastet`() {
        var zurueckgesetzt = 0
        TokenStore.oeffnen(erstellen = { prefs }, zuruecksetzen = { zurueckgesetzt++ })
        assertEquals(0, zurueckgesetzt)
    }

    @Test
    fun `gemerkte Anmeldedaten ueberstehen das Abmelden und lassen sich vergessen`() {
        val store = TokenStore(prefs)
        store.anmeldedatenMerken("lager@example.com", "geheim-123")
        store.accessToken = "a"; store.refreshToken = "r"
        store.clearTokens()
        assertEquals("lager@example.com", store.gespeicherteEmail)
        assertEquals("geheim-123", store.gespeichertesPasswort)
        store.anmeldedatenVergessen()
        assertEquals(null, store.gespeicherteEmail)
        assertEquals(null, store.gespeichertesPasswort)
    }
}
