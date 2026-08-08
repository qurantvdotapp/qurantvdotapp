package com.qurantv.app.ui.player

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
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
 * Transport bar: play/pause, prev/next ayah + surah, repeat, speed, mushaf
 * picker, jump-to-surah, auto-hide toggle and mode toggle. Compact buttons so
 * the mushaf keeps as much screen as possible. No seek bar — seeking is done
 * with the prev/next ayah and surah buttons (it used to grab D-pad focus
 * unnecessarily); only a plain (non-focusable) time readout is shown.
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

        // Plain time readout — NOT focusable, so D-pad never gets stuck on it.
        Text(
            text = "${formatTime(positionMs)} / ${formatTime(state.durationMs)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .background(com.qurantv.app.ui.theme.SurfaceContainer, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp, vertical = 6.dp),
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
        TvIconButton(onClick = onToggleAutoHide) {
            Icon(
                imageVector = if (autoHideEnabled) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                contentDescription = stringResource(R.string.auto_hide),
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
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

private fun formatTime(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s) else String.format(Locale.US, "%d:%02d", m, s)
}
