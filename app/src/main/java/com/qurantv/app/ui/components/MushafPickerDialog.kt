package com.qurantv.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
 * Combined display-mode + mushaf style chooser — one list so there is no
 * separate text/image toggle to keep straight:
 *
 *  - display mode: text list or mushaf page (marked with ✓)
 *  - mushaf style: the six page styles (marked with ✓)
 *
 * Pressing a row applies it immediately and closes the dialog.
 */
@Composable
fun MushafPickerDialog(
    displayMode: Int,
    currentStyle: Int,
    onSelectDisplayMode: (Int) -> Unit,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    data class Option(val value: Int, val name: String)

    val modes = listOf(
        Option(0, stringResource(R.string.text_mode)),
        Option(1, stringResource(R.string.page_mode)),
    )
    val styles = listOf(
        Option(0, stringResource(R.string.mushaf_madinah)),
        Option(1, stringResource(R.string.mushaf_tajweed)),
        Option(2, stringResource(R.string.mushaf_madinah_hd)),
        Option(3, stringResource(R.string.mushaf_ayat_hafs)),
        Option(4, stringResource(R.string.mushaf_ayat_warsh)),
        Option(5, stringResource(R.string.mushaf_hafs_tajweed)),
    )
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
                text = stringResource(R.string.display_mode),
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
                item(key = "mode_header") {
                    SectionLabel(stringResource(R.string.display_mode))
                }
                items(modes, key = { "mode_${it.value}" }) { option ->
                    OptionRow(
                        name = option.name,
                        selected = option.value == displayMode,
                        dialogFocus = dialogFocus,
                        isFirst = option.value == modes.first().value,
                        onClick = { onSelectDisplayMode(option.value) },
                    )
                }
                item(key = "style_header") {
                    SectionLabel(stringResource(R.string.mushaf_style))
                }
                items(styles, key = { "style_${it.value}" }) { option ->
                    OptionRow(
                        name = option.name,
                        selected = option.value == currentStyle,
                        dialogFocus = null,
                        isFirst = false,
                        onClick = { onSelect(option.value) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 10.dp, bottom = 6.dp),
    )
}

@Composable
private fun OptionRow(
    name: String,
    selected: Boolean,
    dialogFocus: FocusRequester?,
    isFirst: Boolean,
    onClick: () -> Unit,
) {
    TvCard(
        onClick = onClick,
        modifier = if (dialogFocus != null && isFirst) {
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
            text = (if (selected) "✓ " else "") + name,
            style = MaterialTheme.typography.bodyLarge,
            color = if (selected) {
                MaterialTheme.colorScheme.onPrimaryContainer
            } else {
                MaterialTheme.colorScheme.onSurface
            },
        )
    }
}
