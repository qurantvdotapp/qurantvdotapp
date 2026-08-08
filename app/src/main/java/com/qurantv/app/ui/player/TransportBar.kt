package com.qurantv.app.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NavigateBefore
import androidx.compose.material.icons.automirrored.filled.NavigateNext
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.player.PlayerUiState
import com.qurantv.app.player.RepeatMode
import com.qurantv.app.ui.components.TvIconButton
import java.util.Locale
import android.view.KeyEvent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.type

/**
 * Transport bar: play/pause, prev/next ayah + surah, seek (D-pad left/right,
 * ±5s), repeat cycle, speed cycle, mushaf picker, jump-to-surah and mode toggle.
 * Compact buttons so the mushaf pages keep as much screen as possible.
 */
@Composable
fun TransportBar(
    state: PlayerUiState,
    positionMs: Long,
    mushafLabel: String,
    playFocusRequester: FocusRequester? = null,
    onTogglePlayPause: () -> Unit,
    onPrevAyah: () -> Unit,
    onNextAyah: () -> Unit,
    onPrevSurah: () -> Unit,
    onNextSurah: () -> Unit,
    onCycleRepeat: () -> Unit,
    onCycleSpeed: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onOpenSurahJump: () -> Unit,
    onOpenMushafPicker: () -> Unit,
    onToggleMode: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TransportButton(icon = Icons.Filled.SkipPrevious, onClick = onPrevSurah, label = stringResource(R.string.prev_surah))
        Spacer(Modifier.width(8.dp))
        TransportButton(icon = Icons.AutoMirrored.Filled.NavigateBefore, onClick = onPrevAyah, label = stringResource(R.string.prev_ayah))
        Spacer(Modifier.width(8.dp))
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
        Spacer(Modifier.width(8.dp))
        TransportButton(icon = Icons.AutoMirrored.Filled.NavigateNext, onClick = onNextAyah, label = stringResource(R.string.next_ayah))
        Spacer(Modifier.width(8.dp))
        TransportButton(icon = Icons.Filled.SkipNext, onClick = onNextSurah, label = stringResource(R.string.next_surah))
        Spacer(Modifier.width(12.dp))

        SeekControl(
            positionMs = positionMs,
            durationMs = state.durationMs,
            onSeekBy = onSeekBy,
        )
        Spacer(Modifier.width(12.dp))

        val repeatLabel = when (state.repeatMode) {
            RepeatMode.OFF -> stringResource(R.string.repeat_off_short)
            RepeatMode.AYAH -> stringResource(R.string.repeat_ayah_short)
            RepeatMode.SURAH -> stringResource(R.string.repeat_surah_short)
        }
        LabeledButton(label = repeatLabel, onClick = onCycleRepeat)
        Spacer(Modifier.width(8.dp))
        LabeledButton(label = speedLabel(state.speed), onClick = onCycleSpeed)
        Spacer(Modifier.width(8.dp))
        // Mushaf style selection lives in the transport bar for easy D-pad access.
        LabeledButton(label = mushafLabel, onClick = onOpenMushafPicker)
        Spacer(Modifier.width(8.dp))
        LabeledButton(label = stringResource(R.string.jump_to_surah_short), onClick = onOpenSurahJump)
        Spacer(Modifier.width(8.dp))
        TvIconButton(onClick = onToggleMode) {
            Icon(
                imageVector = if (state.hasTiming || state.timing != null) Icons.AutoMirrored.Filled.MenuBook else Icons.Filled.TextFields,
                contentDescription = stringResource(R.string.display_mode),
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun TransportButton(
    icon: ImageVector,
    onClick: () -> Unit,
    label: String,
) {
    TvIconButton(onClick = onClick) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.onSurface,
        )
    }
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

/** D-pad scrub control: left/right seeks by ±5s while this control is focused. */
@Composable
private fun SeekControl(
    positionMs: Long,
    durationMs: Long,
    onSeekBy: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val progress = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (focused) com.qurantv.app.ui.theme.SurfaceContainerHigh
                else com.qurantv.app.ui.theme.SurfaceContainer,
                RoundedCornerShape(10.dp),
            )
            .border(
                2.dp,
                if (focused) MaterialTheme.colorScheme.primary else Color.Transparent,
                RoundedCornerShape(10.dp),
            )
            .focusable(interactionSource = interaction)
            .onFocusChanged { focused = it.isFocused }
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            onSeekBy(-5_000)
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            onSeekBy(5_000)
                            true
                        }
                        KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            onSeekBy(-15_000)
                            true
                        }
                        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            onSeekBy(15_000)
                            true
                        }
                        else -> false
                    }
                } else {
                    false
                }
            }
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = formatTime(positionMs),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.width(180.dp).padding(horizontal = 10.dp),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
        )
        Text(
            text = formatTime(durationMs),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
