package de.winterfeld.logistik.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Die zwei Symbole der Sync-Anzeige, mit den Pfaden aus Googles Material-Icons
 * (cloud, cloud_done; Apache 2.0).
 *
 * Bewusst hier statt aus material-icons-extended: diese Bibliothek bringt
 * mehrere tausend Symbole mit und machte den groessten Teil des APKs aus —
 * fuer zwei davon.
 */
object SyncIcons {

    private const val WOLKE =
        "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 " +
        "2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 " +
        "0-2.64-2.05-4.78-4.65-4.96z"

    private const val HAKEN =
        "M10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41L10 17z"

    val Cloud: ImageVector by lazy { symbol("Cloud", WOLKE) }
    val CloudDone: ImageVector by lazy { symbol("CloudDone", WOLKE + HAKEN) }

    private fun symbol(name: String, pfad: String) = ImageVector.Builder(
        name = name, defaultWidth = 24.dp, defaultHeight = 24.dp,
        viewportWidth = 24f, viewportHeight = 24f,
    ).addPath(pathData = addPathNodes(pfad), fill = SolidColor(Color.Black)).build()
}
