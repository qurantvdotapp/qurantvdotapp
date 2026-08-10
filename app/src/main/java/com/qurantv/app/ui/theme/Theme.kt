package com.qurantv.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Shapes
import androidx.tv.material3.Typography
import com.qurantv.app.R

/**
 * Quran text typeface (Amiri Quran, SIL OFL) — a proper naskh face designed for
 * the uthmani mushaf script with full diacritics coverage. Used ONLY for Quran
 * content (ayah text, basmala), never for UI chrome.
 */
val QuranFontFamily = FontFamily(Font(R.font.amiri_quran))

/** tv-material 1.0.x has no `surfaceContainer*` tokens — provide stable equivalents. */
val SurfaceContainerLow = Color(0xFF0D1726)
val SurfaceContainer = Color(0xFF131F35)
val SurfaceContainerHigh = Color(0xFF1B2A44)

/** Subtle night-sky gradient used behind screens. */
val BackgroundBrush: Brush = Brush.verticalGradient(
    listOf(Color(0xFF0A1220), Color(0xFF0F1B2E)),
)

/** Accent gradient for the hero Continue card. */
val HeroBrush: Brush = Brush.horizontalGradient(
    listOf(Color(0xFF1C2A14), Color(0xFF23331B)),
)

/** Night-sky palette tuned for a 10-foot TV screen. */
private val QuranColors = ColorScheme(
    primary = Color(0xFFFFD54F),
    onPrimary = Color(0xFF1A1400),
    primaryContainer = Color(0xFF4A3A00),
    onPrimaryContainer = Color(0xFFFFE082),
    inversePrimary = Color(0xFF4A3A00),
    secondary = Color(0xFF80DEEA),
    onSecondary = Color(0xFF00202B),
    secondaryContainer = Color(0xFF00363F),
    onSecondaryContainer = Color(0xFFB2EBF2),
    tertiary = Color(0xFFA5D6A7),
    onTertiary = Color(0xFF00210A),
    tertiaryContainer = Color(0xFF1B3A22),
    onTertiaryContainer = Color(0xFFC8E6C9),
    background = Color(0xFF0A1220),
    onBackground = Color(0xFFE8EAF0),
    surface = Color(0xFF101B2E),
    onSurface = Color(0xFFE8EAF0),
    surfaceVariant = Color(0xFF1B2A44),
    onSurfaceVariant = Color(0xFFB8C2D6),
    surfaceTint = Color(0xFFFFD54F),
    inverseSurface = Color(0xFFE8EAF0),
    inverseOnSurface = Color(0xFF101B2E),
    error = Color(0xFFFF8A80),
    onError = Color(0xFF3E0000),
    errorContainer = Color(0xFF5C1A1A),
    onErrorContainer = Color(0xFFFFDAD6),
    border = Color(0xFF5A6B8C),
    borderVariant = Color(0xFF3A4A66),
    scrim = Color(0xCC000000),
)

@Composable
fun QuranTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = QuranColors,
        typography = Typography(),
        shapes = Shapes(),
        content = content,
    )
}
