package com.qurantv.app.ui.components

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.nativeKeyCode
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.domain.Reciter
import com.qurantv.app.ui.theme.SurfaceContainer
import com.qurantv.app.ui.theme.SurfaceContainerHigh
import java.util.Locale

/**
 * Reciter chooser for the player's transport bar: sorted alphabetically
 * (Arabic collation), with a search field that filters the list as you type
 * (the keyboard's search key / Enter opens the first match). The current
 * reciter is marked ✓; picking a multi-moshaf reciter continues through the
 * mushaf chooser.
 */
@Composable
fun ReciterPickerDialog(
    reciters: List<Reciter>,
    currentReciterId: Int?,
    onSelect: (Reciter) -> Unit,
    onDismiss: () -> Unit,
) {
    if (reciters.isEmpty()) return
    val collator = remember { java.text.Collator.getInstance(Locale("ar")) }
    val sorted = remember(reciters) {
        reciters.sortedWith(Comparator { a, b -> collator.compare(a.name, b.name) })
    }
    var query by remember { mutableStateOf("") }
    val visible = remember(query, sorted) {
        val q = query.trim()
        if (q.isEmpty()) {
            sorted
        } else {
            sorted.filter {
                it.name.contains(q, ignoreCase = true) ||
                    it.letter?.equals(q, ignoreCase = true) == true
            }
        }
    }
    val focusRow = sorted.indexOfFirst { it.id == currentReciterId }.coerceAtLeast(0)
    val listState = rememberLazyListState()
    val fieldFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var fieldFocused by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        LaunchedEffect(Unit) {
            // Scroll the (sorted) list to the current reciter, then focus the
            // search field so typing works immediately.
            if (focusRow > 0) listState.scrollToItem(focusRow)
            var got = false
            repeat(8) {
                withFrameNanos { }
                if (fieldFocus.requestFocus()) {
                    got = true
                    return@repeat
                }
                kotlinx.coroutines.delay(120)
            }
            if (got) keyboard?.show()
        }
        Column(
            modifier = Modifier
                .width(720.dp)
                .background(SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp)
                .onPreviewKeyEvent { event ->
                    // Remote Enter/OK with the search field focused = select the
                    // first match (some remotes never deliver ImeAction.Search).
                    if (event.type == KeyEventType.KeyDown &&
                        fieldFocused &&
                        (event.key.nativeKeyCode == KeyEvent.KEYCODE_ENTER ||
                            event.key.nativeKeyCode == KeyEvent.KEYCODE_DPAD_CENTER)
                    ) {
                        visible.firstOrNull()?.let(onSelect)
                        true
                    } else {
                        false
                    }
                },
        ) {
            Text(
                text = stringResource(R.string.choose_reciter),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            BasicTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp)
                    .background(SurfaceContainerHigh, MaterialTheme.shapes.small)
                    .padding(14.dp)
                    .focusRequester(fieldFocus)
                    .focusable()
                    .onFocusChanged { fieldFocused = it.isFocused },
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = MaterialTheme.typography.bodyLarge.fontSize,
                ),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = { visible.firstOrNull()?.let(onSelect) },
                ),
                decorationBox = { inner ->
                    if (query.isEmpty()) {
                        Text(
                            text = stringResource(R.string.search_reciters),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    inner()
                },
            )
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).padding(top = 14.dp),
            ) {
                items(visible, key = { it.id }) { reciter ->
                    val selected = reciter.id == currentReciterId
                    TvCard(
                        onClick = { onSelect(reciter) },
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = if (selected) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            SurfaceContainerHigh
                        },
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = (if (selected) "✓ " else "") + reciter.name,
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
