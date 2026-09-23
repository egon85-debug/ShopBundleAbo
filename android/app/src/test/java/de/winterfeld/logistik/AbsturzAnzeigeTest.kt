package de.winterfeld.logistik

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/** Nach einem Absturz zeigt die App zuerst den Bericht — ohne Compose, ohne Container. */
@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [35])
class AbsturzAnzeigeTest {

    private fun texte(view: View): List<String> = when (view) {
        is TextView -> listOf(view.text.toString())
        is ViewGroup -> (0 until view.childCount).flatMap { texte(view.getChildAt(it)) }
        else -> emptyList()
    }

    @Test
    fun `Bericht erscheint beim naechsten Start und laesst sich wegtippen`() {
        val context = ApplicationProvider.getApplicationContext<TestApp>()
        File(context.filesDir, "absturzbericht.txt")
            .writeText("App 1.0.46\nThread: main\n\njava.lang.IllegalStateException: kaputt")

        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val root = activity.window.decorView
        val alle = texte(root)
        assertTrue(alle.any { it.contains("abgestürzt") })
        assertTrue(alle.any { it.contains("IllegalStateException: kaputt") })

        // "App trotzdem starten" → derselbe Absturz wird nicht noch einmal gezeigt
        fun finde(view: View): Button? = when (view) {
            is Button -> view.takeIf { it.text == "App trotzdem starten" }
            is ViewGroup -> (0 until view.childCount).firstNotNullOfOrNull { finde(view.getChildAt(it)) }
            else -> null
        }
        finde(root)!!.performClick()
        assertTrue(CrashReporter.anzuzeigenderAbsturz(context) == null)
    }
}
