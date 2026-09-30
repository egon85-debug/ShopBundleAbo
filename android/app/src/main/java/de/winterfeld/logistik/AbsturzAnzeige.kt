package de.winterfeld.logistik

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import de.winterfeld.logistik.data.remote.dto.ClientErrorDto
import kotlinx.coroutines.runBlocking

/**
 * Sicherheitsbildschirm nach einem Absturz: bewusst mit einfachen
 * Android-Views statt Compose und ohne den App-Container vorauszusetzen.
 * Zeigt den Bericht zum Abfotografieren oder Teilen und versucht nebenbei,
 * ihn an den Server zu schicken.
 */
object AbsturzAnzeige {

    fun zeigen(activity: Activity, bericht: String, onWeiter: () -> Unit) {
        fun dp(wert: Int) = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, wert.toFloat(), activity.resources.displayMetrics).toInt()

        val status = TextView(activity).apply {
            text = "Sende den Bericht an den Server …"
            setTextColor(Color.DKGRAY)
            textSize = 15f
        }
        val inhalt = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(32))
            addView(TextView(activity).apply {
                text = "Die App ist beim letzten Mal abgestürzt"
                textSize = 22f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.BLACK)
            })
            addView(TextView(activity).apply {
                text = "Bitte ein Bildschirmfoto von diesem Text machen oder auf „Teilen“ " +
                       "tippen und ihn weiterschicken. Er enthält nur die Stelle im " +
                       "Programm, keine Passwörter oder Eingaben."
                textSize = 16f
                setTextColor(Color.BLACK)
                setPadding(0, dp(8), 0, dp(8))
            })
            addView(status)
            addView(Button(activity).apply {
                text = "Teilen"
                setOnClickListener {
                    val senden = Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, "Winterfeldt Lager: Absturzbericht")
                        .putExtra(Intent.EXTRA_TEXT, bericht)
                    activity.startActivity(Intent.createChooser(senden, "Bericht teilen"))
                }
            })
            addView(Button(activity).apply {
                text = "App trotzdem starten"
                setOnClickListener { onWeiter() }
            })
            addView(TextView(activity).apply {
                text = bericht
                typeface = Typeface.MONOSPACE
                textSize = 12f
                setTextColor(Color.BLACK)
                setTextIsSelectable(true)
                setPadding(0, dp(12), 0, 0)
            })
        }
        activity.setContentView(ScrollView(activity).apply {
            setBackgroundColor(Color.WHITE)
            // Ab Android 15 liegt der Inhalt sonst unter der Statusleiste.
            fitsSystemWindows = true
            addView(inhalt)
        })

        val main = Handler(Looper.getMainLooper())
        Thread {
            val ergebnis = try {
                val container = (activity.application as WinterfeldApp).container
                val ok = runBlocking {
                    container.productRepository.reportError(ClientErrorDto(
                        kind = "crash", appVersion = BuildConfig.VERSION_NAME,
                        device = CrashReporter.geraet(), report = bericht))
                }
                if (ok) "✓ Bericht ist auf dem Server angekommen."
                else "Server hat den Bericht nicht angenommen — bitte Bildschirmfoto schicken."
            } catch (t: Throwable) {
                "Senden nicht möglich (${t.javaClass.simpleName}: ${t.message}) — " +
                    "bitte Bildschirmfoto schicken."
            }
            main.post { status.text = ergebnis }
        }.start()
    }
}
