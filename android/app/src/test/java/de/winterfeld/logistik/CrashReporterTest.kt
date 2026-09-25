package de.winterfeld.logistik

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [34])
class CrashReporterTest {

    @Test
    fun `aus dem ANR-Protokoll bleibt nur der Hauptthread`() {
        val protokoll = """
            ----- pid 123 at 2026-09-23 -----
            "Signal Catcher" daemon prio=10
              at irgendwas

            "main" prio=5 tid=1 Runnable
              at androidx.compose.foundation.text.CoreTextFieldKt.layout(CoreTextField.kt:1)
              at de.winterfeld.logistik.ui.screens.ProductScreensKt.TextDialog(ProductScreens.kt:560)

            "OkHttp Dispatcher" prio=5
              at okhttp3.X
        """.trimIndent()
        val main = CrashReporter.hauptThread(protokoll)
        assertTrue(main.startsWith("\"main\""))
        assertTrue(main.contains("ProductScreens.kt:560"))
        assertTrue(!main.contains("OkHttp") && !main.contains("Signal Catcher"))
    }

    @Test
    fun `Absturz wird gespeichert und nach dem Melden geloescht`() {
        val context = ApplicationProvider.getApplicationContext<TestApp>()
        File(context.filesDir, "absturzbericht.txt").writeText("Thread: main\n\njava.lang.X: kaputt")
        val berichte = CrashReporter.offeneBerichte(context)
        assertEquals(1, berichte.size)
        assertEquals("crash", berichte[0].art)
        assertTrue(berichte[0].text.contains("kaputt"))
        CrashReporter.gemeldet(context, berichte)
        assertEquals(0, CrashReporter.offeneBerichte(context).size)
    }
}
