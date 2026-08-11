package com.qurantv.app.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NavigateBefore
import androidx.compose.material.icons.filled.NavigateNext
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.player.PlayerUiState
import com.qurantv.app.player.RepeatMode
import com.qurantv.app.ui.components.TvIconButton
import java.util.Locale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester

/**
 * Transport bar, organised into three logical zones so it is easy to scan and
 * navigate with a D-pad:
 *
 *  - RIGHT zone (RTL start): view controls — display-mode toggle (the book /
 *    text icon) with the auto-hide eye next to it.
 *  - CENTER zone: the playback controls — next surah · next ayah · play/pause ·
 *    previous ayah · previous surah (next on the left of play, previous on the
 *    right, RTL style) — with the time readout, dead centre.
 *  - LEFT zone (RTL end): repeat · speed · mushaf style · jump-to-surah.
 *
 * The playback cluster is emitted direction-aware so the ON-SCREEN (left →
 * right) order is always next surah · next ayah · play · previous ayah ·
 * previous surah, in both RTL (Arabic) and LTR layouts, with auto-mirrored icons that
 * point outward from the play button. No seek bar — seeking is done with the
 * prev/next ayah and surah buttons; only a plain (non-focusable) time readout
 * is shown.
 */
@Composable
fun TransportBar(
    state: PlayerUiState,
    positionMs: Long,
    mushafLabel: String,
    autoHideEnabled: Boolean,
    playFocusRequester: FocusRequester? = null,
    onTogglePlayPause: () -> Unit,
    onPrevAyah: () -> Unit,
    onNextAyah: () -> Unit,
    onPrevSurah: () -> Unit,
    onNextSurah: () -> Unit,
    onCycleRepeat: () -> Unit,
    onCycleSpeed: () -> Unit,
    onOpenSurahJump: () -> Unit,
    onOpenMushafPicker: () -> Unit,
    onToggleAutoHide: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl

    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // ---- Right zone: view controls — the auto-hide eye, and the single
        // mushaf button (opens the combined display-mode + style list).
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TvIconButton(onClick = onToggleAutoHide) {
                    Icon(
                        imageVector = if (autoHideEnabled) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                        contentDescription = stringResource(R.string.auto_hide),
                        modifier = Modifier.size(22.dp),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.width(8.dp))
                // The combined display-mode + mushaf-style chooser.
                LabeledButton(label = mushafLabel, onClick = onOpenMushafPicker)
            }
        }

        // ---- Center zone: ONLY the playback cluster, dead centre (next surah ·
        // next ayah · play · previous ayah · previous surah).
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // A Row lays children right-to-left in RTL, so the declaration
                // order there is the reverse of the on-screen (left → right) order.
                val cluster: List<@Composable () -> Unit> = listOf(
                    { TransportButton(icon = Icons.Filled.SkipNext, onClick = onNextSurah, label = stringResource(R.string.next_surah), mirror = rtl) },
                    { TransportButton(icon = Icons.Filled.NavigateNext, onClick = onNextAyah, label = stringResource(R.string.next_ayah), mirror = rtl) },
                    {
                        TvIconButton(
                            onClick = onTogglePlayPause,
                            modifier = if (playFocusRequester != null) Modifier.focusRequester(playFocusRequester) else Modifier,
                        ) {
                            Icon(
                                imageVector = if (state.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(34.dp),
                                tint = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    },
                    { TransportButton(icon = Icons.Filled.NavigateBefore, onClick = onPrevAyah, label = stringResource(R.string.prev_ayah), mirror = rtl) },
                    { TransportButton(icon = Icons.Filled.SkipPrevious, onClick = onPrevSurah, label = stringResource(R.string.prev_surah), mirror = rtl) },
                )
                val ordered = if (rtl) cluster.asReversed() else cluster
                ordered.forEachIndexed { i, slot ->
                    if (i > 0) Spacer(Modifier.width(8.dp))
                    slot()
                }
            }
        }

        // ---- Left zone: time readout (right of this section, next to the
        // cluster) · repeat · speed · jump-to-surah. Declared so the on-screen
        // (RTL) order is السور · 1× · repeat · time.
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TimeReadout(positionMs, state.durationMs)
                Spacer(Modifier.width(10.dp))
                val repeatActive = state.repeatMode != RepeatMode.OFF
                TvIconButton(onClick = onCycleRepeat) {
                    Icon(
                        imageVector = if (state.repeatMode == RepeatMode.AYAH) Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                        contentDescription = when (state.repeatMode) {
                            RepeatMode.OFF -> stringResource(R.string.repeat_off_short)
                            RepeatMode.AYAH -> stringResource(R.string.repeat_ayah_short)
                            RepeatMode.SURAH -> stringResource(R.string.repeat_surah_short)
                        },
                        modifier = Modifier.size(22.dp),
                        tint = if (repeatActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Spacer(Modifier.width(8.dp))
                LabeledButton(label = speedLabel(state.speed), onClick = onCycleSpeed)
                Spacer(Modifier.width(8.dp))
                LabeledButton(label = stringResource(R.string.jump_to_surah_short), onClick = onOpenSurahJump)
            }
        }
    }
}

@Composable
private fun TransportButton(
    icon: ImageVector,
    onClick: () -> Unit,
    label: String,
    mirror: Boolean = false,
) {
    TvIconButton(onClick = onClick) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            // The material directional icons auto-mirror in RTL; un-mirror them
            // so the arrows always point outward from play (prev ← , next →) in
            // both Arabic and English layouts.
            modifier = (if (mirror) Modifier.scale(scaleX = -1f, scaleY = 1f) else Modifier).size(24.dp),
            tint = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun TimeReadout(positionMs: Long, durationMs: Long) {
    Text(
        text = "${formatTime(positionMs)} / ${formatTime(durationMs)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 1,
        modifier = Modifier
            .widthIn(min = 130.dp)
            .background(com.qurantv.app.ui.theme.SurfaceContainer, RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

private fun speedLabel(speed: Float): String {
    val s = if (speed == speed.toInt().toFloat()) speed.toInt().toString() else speed.toString()
    return "$s×"
}

@Composable
private fun LabeledButton(label: String, onClick: () -> Unit) {
    TvIconButton(onClick = onClick) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun formatTime(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s) else String.format(Locale.US, "%d:%02d", m, s)
}
