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
import com.qurantv.app.domain.PageMapping
import com.qurantv.app.domain.PointF
import com.qurantv.app.domain.ViewBox
import kotlin.math.roundToInt

/**
 * Mushaf page mode: renders the Madinah mushaf SVG page and draws a translucent
 * rounded highlight over the current ayah's polygon (PROMPT.md Part 5).
 *
 * Coordinate mapping (verified): polygon points live in the page's `viewBox`
 * space; `screen = pageSpace * displaySize / viewBoxSize`.
 */
@Composable
fun PageModeView(
    bitmap: ImageBitmap?,
    viewBox: ViewBox?,
    polygon: List<PointF>?,
    highlightColor: Color,
    modifier: Modifier = Modifier,
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
        val vb = viewBox ?: ViewBox.DEFAULT
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
            if (polygon != null && polygon.size >= 3) {
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
            }
        }
    }
}
