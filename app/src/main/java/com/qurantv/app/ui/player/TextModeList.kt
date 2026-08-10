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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.ui.theme.SurfaceContainerHigh
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/**
 * Text mode: a list of ayah texts with the current ayah highlighted and
 * auto-scrolled in sync with the audio (PROMPT.md Part 6). Row index == timing
 * ayah index.
 *
 * Long-ayah handling: when the current ayah is taller than the viewport (e.g.
 * 2:282 is 136 s of recitation), the list scrolls through it proportionally to
 * playback progress inside [startMs..endMs] so the part being recited stays on
 * screen. If the user scrolls manually the follow pauses until the ayah changes.
 */
@Composable
fun TextModeList(
    items: List<TextItem>,
    currentIndex: Int,
    fontSizeSp: Int,
    highlightColor: Color,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    resetKey: Any = 0,
    positionMs: Long = 0L,
    currentAyahStartMs: Long = 0L,
    currentAyahEndMs: Long = 0L,
    isPlaying: Boolean = false,
) {
    // A fresh scroll state per surah so a new surah starts at the top.
    val listState = remember(resetKey) { LazyListState() }

    // Live values for the follow loop (avoid stale captures; loop is keyed on
    // currentIndex only, so it must not restart on every position tick).
    val livePosition by rememberUpdatedState(positionMs)
    val livePlaying by rememberUpdatedState(isPlaying)
    val liveStart by rememberUpdatedState(currentAyahStartMs)
    val liveEnd by rememberUpdatedState(currentAyahEndMs)

    // 1) On ayah change: pin the current ayah to the TOP of the viewport so it
    //    is displayed in full (the classic Quran-app reading position). For long
    //    ayahs the follow loop below then walks through the overflow in sync.
    LaunchedEffect(currentIndex) {
        if (currentIndex >= 0) {
            // Verse row position is one less than the timing index (no header row);
            // the basmala slot (index 0) pins verse 1 at the top.
            listState.animateScrollToItem((currentIndex - 1).coerceAtLeast(0), scrollOffset = 0)
        }
    }

    // 2) Long-ayah follow: while playing and the current ayah overflows the
    //    viewport, scroll proportionally to the playback position inside the
    //    ayah. Stops for good once the user takes over the list (their scroll
    //    position diverges from the commanded one) until the ayah changes.
    LaunchedEffect(currentIndex) {
        if (currentIndex <= 1) return@LaunchedEffect
        val span = liveEnd - liveStart
        if (span <= 0) return@LaunchedEffect
        var commandedTop: Float? = null
        var stopped = false
        while (isActive && !stopped) {
            // Defer the first step until the entry-alignment scroll finished.
            if (commandedTop == null && listState.isScrollInProgress) {
                delay(100)
                continue
            }
            if (livePlaying) {
                val info = listState.layoutInfo
                val item = info.visibleItemsInfo.firstOrNull { it.index == currentIndex - 1 }
                val viewportH = (info.viewportEndOffset - info.viewportStartOffset).coerceAtLeast(1)
                val overflow = (item?.size ?: 0) - viewportH
                if (item != null && overflow > 0) {
                    val progress = ((livePosition - liveStart).toFloat() / span).coerceIn(0f, 1f)
                    // Negative offset: the item's top sits above the viewport top;
                    // at progress=1 the item's bottom aligns with the viewport bottom.
                    val targetTop = -(progress * overflow)
                    val currentTop = item.offset
                    val divergence = commandedTop?.let { abs(currentTop - it) } ?: 0f
                    if (commandedTop != null && divergence > 120f && !listState.isScrollInProgress) {
                        stopped = true // user took over — don't fight them
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
        contentPadding = PaddingValues(horizontal = 56.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items(items, key = { it.index }) { item ->
            val isCurrent = item.index == currentIndex
            val interaction = remember { MutableInteractionSource() }
            val focused by interaction.collectIsFocusedAsState()
            val scale by animateFloatAsState(
                if (isCurrent) 1.02f else if (focused) 1.03f else 1f,
                tween(140),
                label = "ayahScale",
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
                verticalAlignment = Alignment.CenterVertically,
            ) {
                VerseBadge(item)
                Text(
                    text = item.text,
                    modifier = Modifier.padding(start = 18.dp),
                    style = MaterialTheme.typography.bodyLarge,
                    fontFamily = com.qurantv.app.ui.theme.QuranFontFamily,
                    fontSize = fontSizeSp.sp,
                    lineHeight = (fontSizeSp * 1.55f).sp,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun VerseBadge(item: TextItem) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = item.verseKey?.substringAfter(':') ?: "",
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}
