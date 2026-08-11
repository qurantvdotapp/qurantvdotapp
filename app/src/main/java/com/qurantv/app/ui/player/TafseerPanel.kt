package com.qurantv.app.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.domain.AyahTafseer
import com.qurantv.app.ui.theme.SurfaceContainer

/**
 * The tafseer panel shown on the mushaf page that is NOT reciting: the current
 * ayah's word meanings (المعاني), the simplified tafseer (الميسر) and the
 * English translation, scrollable with the D-pad when focused.
 */
@Composable
fun TafseerPanel(
    verseLabel: String,
    ayahText: String,
    tafseer: AyahTafseer?,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    onFocusChanged: (Boolean) -> Unit = {},
) {
    Box(modifier.fillMaxSize().background(SurfaceContainer)) {
        // Fresh scroll state per verse so a new ayah starts at the top.
        val listState = remember(verseLabel) { LazyListState() }
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
                .focusable()
                .onFocusChanged { onFocusChanged(it.isFocused) },
            contentPadding = PaddingValues(horizontal = 22.dp, vertical = 18.dp),
        ) {
            item {
                Text(
                    text = verseLabel,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (ayahText.isNotBlank()) {
                item {
                    Text(
                        text = ayahText,
                        style = MaterialTheme.typography.bodyMedium,
                        fontFamily = com.qurantv.app.ui.theme.QuranFontFamily,
                        fontSize = 22.sp,
                        lineHeight = 34.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
            }
            tafseer?.wordMeanings?.takeIf { it.isNotBlank() }?.let { meanings ->
                item { Spacer(Modifier.height(14.dp)) }
                item { SectionLabel(stringResource(R.string.tafseer_word_meanings)) }
                item {
                    Text(
                        text = meanings.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n"),
                        style = MaterialTheme.typography.bodyMedium,
                        lineHeight = 26.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            tafseer?.tafseer?.takeIf { it.isNotBlank() }?.let { t ->
                item { Spacer(Modifier.height(16.dp)) }
                item { SectionLabel(stringResource(R.string.tafseer_simplified)) }
                item {
                    Text(
                        text = t,
                        style = MaterialTheme.typography.bodyMedium,
                        lineHeight = 27.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            tafseer?.translation?.takeIf { it.isNotBlank() }?.let { tr ->
                item { Spacer(Modifier.height(16.dp)) }
                item { SectionLabel(stringResource(R.string.tafseer_translation)) }
                item {
                    Text(
                        text = tr,
                        style = MaterialTheme.typography.bodyMedium,
                        lineHeight = 26.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
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
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.secondary,
        modifier = Modifier.padding(bottom = 6.dp),
    )
}
