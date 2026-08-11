package com.qurantv.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.domain.QuranSurah

/**
 * Jump-to-surah list dialog, shared by the surah grid and the player. Surahs
 * with no ayah timing for the current read are dimmed with a badge.
 */
@Composable
fun SurahJumpDialog(
    surahs: List<QuranSurah>,
    currentSurahId: Int?,
    untimedSurahIds: Set<Int> = emptySet(),
    onSelect: (QuranSurah) -> Unit,
    onDismiss: () -> Unit,
) {
    if (surahs.isEmpty()) return
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
                .width(660.dp)
                .background(com.qurantv.app.ui.theme.SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
        ) {
            Text(
                text = stringResource(R.string.surah_jump),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).padding(top = 16.dp),
            ) {
                items(surahs, key = { it.id }) { surah ->
                    TvCard(
                        onClick = { onSelect(surah) },
                        modifier = if (surah.id == surahs.first().id) {
                            Modifier.fillMaxWidth().focusRequester(dialogFocus)
                        } else {
                            Modifier.fillMaxWidth()
                        },
                        backgroundColor = if (surah.id == currentSurahId) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            com.qurantv.app.ui.theme.SurfaceContainerHigh
                        },
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "${surah.id} — ${surah.nameAr}",
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (surah.id in untimedSurahIds) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                            if (surah.id in untimedSurahIds) {
                                Spacer(Modifier.width(10.dp))
                                NoTimingBadge()
                            }
                        }
                    }
                }
            }
        }
    }
}
