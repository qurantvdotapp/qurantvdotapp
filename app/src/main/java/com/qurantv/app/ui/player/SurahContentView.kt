package com.qurantv.app.ui.player

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.ui.theme.SurfaceContainerHigh
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/** One row of a full-surah content view (tafseer / word meanings / translation). */
data class SurahContentRow(val index: Int, val verseNumber: String?, val text: String)

/**
 * Full-surah content view — the whole surah's simplified tafseer / word
 * meanings / English translation, one ayah per row with the current ayah
 * highlighted and auto-scrolled in sync with the audio (same follow behavior
 * as text mode: pin to the top on ayah change, proportional scroll for long
 * rows). Rows are keyed by the timing ayah index; without timing the list is
 * static (no highlight movement).
 */
@Composable
fun SurahContentView(
    items: List<SurahContentRow>,
    currentIndex: Int,
    highlightColor: Color,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    resetKey: Any = 0,
    positionMs: Long = 0L,
    currentAyahStartMs: Long = 0L,
    currentAyahEndMs: Long = 0L,
    isPlaying: Boolean = false,
    /** Horizontal padding of the list (narrower in the side panel). */
    contentPadding: PaddingValues = PaddingValues(horizontal = 56.dp, vertical = 6.dp),
    /** Text size in sp (slightly smaller in the side panel). */
    fontSizeSp: Float = 20f,
    /** Gap between rows. */
    rowSpacing: Dp = 6.dp,
) {
    val listState = remember(resetKey) { LazyListState() }
    val livePosition by rememberUpdatedState(positionMs)
    val livePlaying by rememberUpdatedState(isPlaying)
    val liveStart by rememberUpdatedState(currentAyahStartMs)
    val liveEnd by rememberUpdatedState(currentAyahEndMs)

    // Pin the current ayah's row to the top on ayah change, and also when the
    // list (re)populates (e.g. the side panel switches mode: the list starts
    // empty, then fills — the pin must re-apply so the view lands on the
    // CURRENT ayah, not the top of the surah). Rows with empty content are
    // skipped, so the row is found by TIMING INDEX, not list position; when the
    // current ayah itself has no row (empty content), pin to the nearest
    // preceding row so the view still follows the recitation.
    LaunchedEffect(currentIndex, items.size) {
        if (currentIndex >= 0 && items.isNotEmpty()) {
            val pos = items.indexOfLast { it.index <= currentIndex }
            if (pos >= 0) {
                listState.animateScrollToItem(pos, scrollOffset = 0)
            }
        }
    }
    LaunchedEffect(currentIndex) {
        if (currentIndex <= 1) return@LaunchedEffect
        val span = liveEnd - liveStart
        if (span <= 0) return@LaunchedEffect
        var commandedTop: Float? = null
        var stopped = false
        while (isActive && !stopped) {
            if (commandedTop == null && listState.isScrollInProgress) {
                delay(100)
                continue
            }
            if (livePlaying) {
                val info = listState.layoutInfo
                // The current ayah's row, found by timing index (skipped rows shift positions).
                val item = info.visibleItemsInfo.firstOrNull { items.getOrNull(it.index)?.index == currentIndex }
                val viewportH = (info.viewportEndOffset - info.viewportStartOffset).coerceAtLeast(1)
                val overflow = (item?.size ?: 0) - viewportH
                if (item != null && overflow > 0) {
                    val progress = ((livePosition - liveStart).toFloat() / span).coerceIn(0f, 1f)
                    val targetTop = -(progress * overflow)
                    val currentTop = item.offset
                    val divergence = commandedTop?.let { abs(currentTop - it) } ?: 0f
                    if (commandedTop != null && divergence > 120f && !listState.isScrollInProgress) {
                        stopped = true
                    } else if (abs(currentTop - targetTop) > 16f) {
                        listState.animateScrollBy(targetTop - currentTop)
                        commandedTop = targetTop
                    }
                }
            }
            delay(150)
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(rowSpacing),
    ) {
        items(items, key = { it.index }) { item ->
            val isCurrent = item.index == currentIndex
            val interaction = remember { MutableInteractionSource() }
            val focused by interaction.collectIsFocusedAsState()
            val scale by animateFloatAsState(
                if (isCurrent) 1.02f else if (focused) 1.03f else 1f,
                tween(140),
                label = "contentRowScale",
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        when {
                            isCurrent -> highlightColor.copy(alpha = 0.22f)
                            focused -> SurfaceContainerHigh
                            else -> Color.Transparent
                        },
                        RoundedCornerShape(14.dp),
                    )
                    .border(
                        width = if (isCurrent) 3.dp else 0.dp,
                        color = if (isCurrent) highlightColor else Color.Transparent,
                        shape = RoundedCornerShape(14.dp),
                    )
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                    }
                    .clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClick = { onSelect(item.index) },
                    )
                    .padding(horizontal = 22.dp, vertical = 6.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = item.verseNumber ?: "",
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Text(
                    text = item.text,
                    modifier = Modifier.padding(start = 18.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    fontSize = fontSizeSp.sp,
                    lineHeight = (fontSizeSp * 1.5f).sp,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
