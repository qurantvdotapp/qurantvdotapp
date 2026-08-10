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
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.ui.theme.SurfaceContainer
import com.qurantv.app.ui.theme.SurfaceContainerHigh

/**
 * Reciter-mushaf chooser shown BEFORE the surah grid when a reciter has more
 * than one moshaf (riwaya). One row per moshaf, the current one marked with a
 * check; pressing a row applies it immediately and closes. `currentIndex` may
 * be null when there is no current selection (fresh entry from Home).
 */
@Composable
fun MoshafSelectionDialog(
    moshafs: List<Moshaf>,
    currentIndex: Int?,
    onSelect: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        val dialogFocus = remember { FocusRequester() }
        val focusRow = currentIndex?.takeIf { it in moshafs.indices } ?: 0
        LaunchedEffect(Unit) {
            repeat(8) {
                withFrameNanos { }
                if (dialogFocus.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(120)
            }
        }
        Column(
            modifier = Modifier
                .width(640.dp)
                .background(SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
        ) {
            Text(
                text = stringResource(R.string.select_moshaf),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).padding(top = 16.dp),
            ) {
                items(moshafs, key = { it.id }) { moshaf ->
                    val index = moshafs.indexOf(moshaf)
                    val selected = index == currentIndex
                    TvCard(
                        onClick = { onSelect(index) },
                        modifier = if (index == focusRow) {
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
                            text = (if (selected) "✓ " else "") + moshaf.name,
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
