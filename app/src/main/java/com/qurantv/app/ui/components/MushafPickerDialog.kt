package com.qurantv.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.ui.theme.SurfaceContainer
import com.qurantv.app.ui.theme.SurfaceContainerHigh

/**
 * The mushaf chooser: ONE flat list, top → bottom:
 *
 *   Ayah hafs colored · Ayat hafs · Ayat warsh · Almadinah · Almadinah HD ·
 *   Tajweed colored · Text
 *
 * Picking a mushaf switches to page mode with that style; picking Text switches
 * to the verse list. The current selection is marked with ✓ and gets focus.
 */
@Composable
fun MushafPickerDialog(
    displayMode: Int,
    currentStyle: Int,
    onSelectDisplayMode: (Int) -> Unit,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    data class Option(val name: String, val style: Int?, val mode: Int?)

    val options = listOf(
        Option(stringResource(R.string.mushaf_hafs_tajweed), 5, null), // Ayah hafs colored
        Option(stringResource(R.string.mushaf_ayat_hafs), 3, null),    // Ayat hafs
        Option(stringResource(R.string.mushaf_ayat_warsh), 4, null),   // Ayat warsh
        Option(stringResource(R.string.mushaf_madinah), 0, null),      // Almadinah
        Option(stringResource(R.string.mushaf_madinah_hd), 2, null),   // Almadinah HD
        Option(stringResource(R.string.mushaf_tajweed), 1, null),      // Tajweed colored
        Option(stringResource(R.string.text_mode), null, 0),           // Text
    )
    val currentRow = options.indexOfFirst { option ->
        if (displayMode == 0) option.mode != null else option.style == currentStyle
    }.coerceAtLeast(0)

    Dialog(onDismissRequest = onDismiss) {
        val dialogFocus = remember { FocusRequester() }
        LaunchedEffect(Unit) {
            repeat(8) {
                withFrameNanos { }
                if (dialogFocus.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(120)
            }
        }
        Column(
            modifier = Modifier
                .width(560.dp)
                .background(SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
        ) {
            Text(
                text = stringResource(R.string.mushaf_style),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.mushaf_pick_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp).padding(top = 14.dp),
            ) {
                itemsIndexed(options) { index, option ->
                    val selected = if (option.mode != null) {
                        displayMode == 0
                    } else {
                        displayMode == 1 && option.style == currentStyle
                    }
                    TvCard(
                        onClick = {
                            if (option.mode != null) onSelectDisplayMode(option.mode) else option.style?.let(onSelect)
                        },
                        modifier = if (index == currentRow) {
                            Modifier.fillMaxWidth().focusRequester(dialogFocus)
                        } else {
                            Modifier.fillMaxWidth()
                        },
                        backgroundColor = if (selected) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            SurfaceContainerHigh
                        },
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = (if (selected) "✓ " else "") + option.name,
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (selected) {
                                MaterialTheme.colorScheme.onPrimaryContainer
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                        )
                    }
                }
            }
        }
    }
}
