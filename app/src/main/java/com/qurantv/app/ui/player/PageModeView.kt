package com.qurantv.app.ui.player

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.domain.PageAyahBand
import com.qurantv.app.domain.PageMapping
import com.qurantv.app.domain.PointF
import com.qurantv.app.domain.ViewBox
import kotlin.math.roundToInt

/**
 * Mushaf page mode: renders a Madinah mushaf SVG page and highlights the
 * current ayah (PROMPT.md Part 5).
 *
 * Two highlight sources, selected by [bands] vs [polygon]:
 *  - mp3quran SVG pages: the ayah's polygon quad from the timing data, mapped
 *    with `screen = pageSpace * displaySize / viewBoxSize`;
 *  - islamic.app pages: full-width line bands ([PageAyahBand]) extracted from
 *    the page's own `data-ayah` tspans.
 */
@Composable
fun PageModeView(
    bitmap: ImageBitmap?,
    viewBox: ViewBox?,
    polygon: List<PointF>?,
    highlightColor: Color,
    modifier: Modifier = Modifier,
    bands: List<PageAyahBand>? = null,
    bandsFractional: Boolean = false,
) {
    BoxWithConstraints(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val bmp = bitmap
        if (bmp == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "…",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@BoxWithConstraints
        }
        // Raster page sources (KSU PNGs) carry no viewBox — derive the aspect
        // from the bitmap itself; polygon/band mapping is unused for them.
        val vb = viewBox ?: ViewBox(0f, 0f, bmp.width.toFloat(), bmp.height.toFloat())
        val aspect = vb.h / vb.w
        val availW = maxWidth
        val availH = maxHeight
        val dispH = minOf(availH, availW * aspect)
        val dispW = dispH / aspect
        val density = LocalDensity.current
        val dispWpx = with(density) { dispW.toPx() }.roundToInt()
        val dispHpx = with(density) { dispH.toPx() }.roundToInt()
        val dispWf = dispWpx.toFloat()
        val dispHf = dispHpx.toFloat()

        Canvas(
            modifier = Modifier
                .size(dispW, dispH)
                .align(Alignment.Center),
        ) {
            drawImage(
                image = bmp,
                dstOffset = IntOffset.Zero,
                dstSize = IntSize(dispWpx, dispHpx),
            )
            if (polygon != null && polygon.size >= 3 && bands == null) {
                val screen = PageMapping.toScreen(polygon, vb, dispWf, dispHf)
                val left = screen.minOf { it.x }
                val top = screen.minOf { it.y }
                val right = screen.maxOf { it.x }
                val bottom = screen.maxOf { it.y }
                val inset = (2f / vb.w * dispWf) // 1–2px scaled
                val rectLeft = left - inset
                val rectTop = top - inset
                val rectRight = right + inset
                val rectBottom = bottom + inset
                val radius = CornerRadius(8f)
                drawRoundRect(
                    color = highlightColor.copy(alpha = 0.35f),
                    topLeft = Offset(rectLeft, rectTop),
                    size = Size(rectRight - rectLeft, rectBottom - rectTop),
                    cornerRadius = radius,
                )
                drawRoundRect(
                    color = highlightColor,
                    topLeft = Offset(rectLeft, rectTop),
                    size = Size(rectRight - rectLeft, rectBottom - rectTop),
                    cornerRadius = radius,
                    style = Stroke(width = 2.5f),
                )
            } else if (bands != null) {
                // Line-band highlight (islamic.app pages): full-width translucent
                // band per text line the ayah occupies, in viewBox space.
                // Raster-page estimates (KSU) pass fractions of the page height.
                val sy = if (bandsFractional) dispHf else dispHf / vb.h
                val radius = CornerRadius(6f)
                bands.forEach { band ->
                    val yTop = (band.yTop * sy).coerceIn(0f, dispHf)
                    val yBottom = (band.yBottom * sy).coerceIn(0f, dispHf)
                    if (yBottom > yTop) {
                        drawRoundRect(
                            color = highlightColor.copy(alpha = 0.28f),
                            topLeft = Offset(0f, yTop),
                            size = Size(dispWf, yBottom - yTop),
                            cornerRadius = radius,
                        )
                    }
                }
            }
        }
    }
}
