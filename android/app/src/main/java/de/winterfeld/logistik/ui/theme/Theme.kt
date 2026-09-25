package de.winterfeld.logistik.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val WinterfeldColors = lightColorScheme(
    primary = Color(0xFF0B5FFF),
    onPrimary = Color.White,
    secondary = Color(0xFF12805C),
    error = Color(0xFFD92D20),
    background = Color(0xFFF4F6F8),
    surface = Color.White,
    onBackground = Color(0xFF1C2733),
    onSurface = Color(0xFF1C2733),
    // Neutrale Grautöne statt der violetten Material-Vorgaben
    surfaceVariant = Color(0xFFE8ECF1),
    onSurfaceVariant = Color(0xFF475467),
    secondaryContainer = Color(0xFFDCE7FF),
    onSecondaryContainer = Color(0xFF0B3FAA),
    outline = Color(0xFF667085),
    outlineVariant = Color(0xFFE4E7EC),
)

/** Große Schrift für Lagerbedienung mit Handschuhen/Distanz. */
private val WinterfeldTypography = Typography(
    displayLarge = TextStyle(fontSize = 44.sp, fontWeight = FontWeight.ExtraBold),
    headlineMedium = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    bodyLarge = TextStyle(fontSize = 18.sp),
    bodyMedium = TextStyle(fontSize = 16.sp),
    labelLarge = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold),
)

@Composable
fun WinterfeldTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WinterfeldColors,
        typography = WinterfeldTypography,
        content = content,
    )
}
