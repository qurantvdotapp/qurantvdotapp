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

/** Mushaf style picker (Madinah / Tajweed / Madinah HD / Ayat Hafs / Ayat Warsh / Hafs Tajweed). */
@Composable
fun MushafPickerDialog(
    currentStyle: Int,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val options = listOf(
        stringResource(R.string.mushaf_madinah) to 0,
        stringResource(R.string.mushaf_tajweed) to 1,
        stringResource(R.string.mushaf_madinah_hd) to 2,
        stringResource(R.string.mushaf_ayat_hafs) to 3,
        stringResource(R.string.mushaf_ayat_warsh) to 4,
        stringResource(R.string.mushaf_hafs_tajweed) to 5,
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
                text = stringResource(R.string.mushaf_style),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp).padding(top = 16.dp),
            ) {
                items(options, key = { it.second }) { (label, value) ->
                    TvCard(
                        onClick = { onSelect(value) },
                        modifier = if (value == options.first().second) {
                            Modifier.fillMaxWidth().focusRequester(dialogFocus)
                        } else {
                            Modifier.fillMaxWidth()
                        },
                        backgroundColor = if (value == currentStyle) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            SurfaceContainerHigh
                        },
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = label,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
