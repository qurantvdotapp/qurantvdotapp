package com.qurantv.app.ui.home

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.di.AppContainer
import com.qurantv.app.domain.Reciter
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.TvCard

/**
 * Reciter-name search overlay with a D-pad/IME text field (PROMPT.md Part 1.1).
 *
 * TV quirk handled here: a focused text field does NOT reliably bring up the
 * system keyboard (no input connection is created on some TV builds — the
 * field shows focus but typing does nothing). We grab focus robustly and then
 * explicitly request the IME. The field's IME action is "Search": the keyboard
 * shows a search key and pressing it (or the remote's Enter/OK while the field
 * is focused) opens the first matching reciter.
 */
@Composable
fun SearchOverlay(
    container: AppContainer,
    onClose: () -> Unit,
) {
    val vm = container.homeViewModel
    val ui by vm.ui.collectAsState()
    val navigator = container.navigator
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    var fieldFocused by remember { mutableStateOf(false) }

    /** Opens a reciter (mushaf chooser first when it has several), closing search. */
    fun openResult(reciter: Reciter) {
        // Multi-moshaf reciters pick the mushaf first (the chooser opens on
        // Home once search closes).
        if (!vm.requestMoshafSelection(reciter)) {
            reciter.moshafs.firstOrNull()?.let {
                navigator.push(Screen.SurahGrid(reciter, it))
            }
        }
        vm.closeSearch()
        onClose()
    }

    LaunchedEffect(Unit) {
        // Grab focus robustly (the first request can race the dialog window
        // becoming focusable), then explicitly show the keyboard — TVs do not
        // always open it for a focused text field.
        var focused = false
        repeat(8) {
            withFrameNanos { }
            if (focusRequester.requestFocus()) {
                focused = true
                return@repeat
            }
            kotlinx.coroutines.delay(120)
        }
        if (focused) keyboard?.show()
    }

    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier
                .width(720.dp)
                .background(com.qurantv.app.ui.theme.SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp)
                .onPreviewKeyEvent { event ->
                    // Remote Enter/OK with the text field focused = the search
                    // action (some remotes/IMEs never deliver ImeAction.Search).
                    if (event.type == KeyEventType.KeyDown &&
                        fieldFocused &&
                        (event.key.nativeKeyCode == KeyEvent.KEYCODE_ENTER ||
                            event.key.nativeKeyCode == KeyEvent.KEYCODE_DPAD_CENTER)
                    ) {
                        vm.searchResults().firstOrNull()?.let { openResult(it) }
                        true
                    } else {
                        false
                    }
                },
        ) {
            Text(
                text = stringResource(R.string.search_reciters),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            BasicTextField(
                value = ui.searchQuery,
                onValueChange = vm::setSearchQuery,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
                    .background(com.qurantv.app.ui.theme.SurfaceContainerHigh, MaterialTheme.shapes.small)
                    .padding(16.dp)
                    .focusRequester(focusRequester)
                    .focusable()
                    .onFocusChanged { fieldFocused = it.isFocused },
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = MaterialTheme.typography.bodyLarge.fontSize,
                ),
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(
                    onSearch = {
                        // The keyboard's search key: open the first match.
                        vm.searchResults().firstOrNull()?.let { openResult(it) }
                    },
                ),
                decorationBox = { inner ->
                    if (ui.searchQuery.isEmpty()) {
                        Text(
                            text = stringResource(R.string.search_hint),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    inner()
                },
            )
            // Explicit search action: a D-pad target that works even when the
            // system keyboard never appears (some TVs do not show one), and a
            // hint about the IME/Enter path.
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.search_enter_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(12.dp))
                TvCard(
                    onClick = {
                        vm.searchResults().firstOrNull()?.let { openResult(it) }
                    },
                    backgroundColor = MaterialTheme.colorScheme.primaryContainer,
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
                ) {
                    Text(
                        text = stringResource(R.string.search_action),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
            val results = vm.searchResults()
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp).padding(top = 16.dp),
            ) {
                items(results, key = { it.id }) { reciter ->
                    TvCard(
                        onClick = { openResult(reciter) },
                        modifier = Modifier.fillMaxWidth(),
                        backgroundColor = com.qurantv.app.ui.theme.SurfaceContainerHigh,
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = reciter.name,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
