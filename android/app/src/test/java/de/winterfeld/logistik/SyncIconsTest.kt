package de.winterfeld.logistik

import androidx.compose.ui.graphics.vector.VectorPath
import de.winterfeld.logistik.ui.components.SyncIcons
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncIconsTest {

    private fun knoten(icon: androidx.compose.ui.graphics.vector.ImageVector) =
        (icon.root.first() as VectorPath).pathData.size

    @Test
    fun `beide Symbole werden aus den Pfaden gebaut`() {
        assertEquals(24f, SyncIcons.Cloud.viewportWidth)
        assertTrue("Wolke ohne Pfad", knoten(SyncIcons.Cloud) > 5)
        // Die Wolke mit Haken ist die Wolke plus der Haken — also mehr Knoten.
        assertTrue(knoten(SyncIcons.CloudDone) > knoten(SyncIcons.Cloud))
    }
}
