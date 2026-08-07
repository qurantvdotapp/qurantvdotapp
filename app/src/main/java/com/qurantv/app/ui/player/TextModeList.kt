package com.qurantv.app.ui.player

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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

/**
 * Text mode: a list of ayah texts with the current ayah highlighted and
 * auto-scrolled into view (PROMPT.md Part 6). Row index == timing ayah index.
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
) {
    // A fresh scroll state per surah so a new surah starts at the top.
    val listState = remember(resetKey) { LazyListState() }
    LaunchedEffect(currentIndex) {
        if (currentIndex > 1) {
            // Verse row position is one less than the timing index (no header row).
            val pos = currentIndex - 1
            val visible = listState.layoutInfo.visibleItemsInfo
            val current = visible.firstOrNull { it.index == pos }
            val topCutOff = current?.offset?.let { it < 0 } ?: false
            // Only scroll when the current ayah's start is off-screen (below the
            // viewport or scrolled past). Long ayahs keep their full highlighted
            // block on screen instead of being cut at the bottom; manual scrolling
            // is never fought.
            if (current == null || topCutOff) {
                listState.animateScrollToItem(pos, scrollOffset = 0)
            }
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
