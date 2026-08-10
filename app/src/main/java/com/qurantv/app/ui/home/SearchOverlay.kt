package com.qurantv.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.di.AppContainer
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.TvCard

/** Reciter-name search overlay with a D-pad/IME text field (PROMPT.md Part 1.1). */
@Composable
fun SearchOverlay(
    container: AppContainer,
    onClose: () -> Unit,
) {
    val vm = container.homeViewModel
    val ui by vm.ui.collectAsState()
    val navigator = container.navigator
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier
                .width(720.dp)
                .background(com.qurantv.app.ui.theme.SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
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
                    .focusable(),
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = MaterialTheme.typography.bodyLarge.fontSize,
                ),
                singleLine = true,
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
            val results = vm.searchResults()
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp).padding(top = 16.dp),
            ) {
                items(results, key = { it.id }) { reciter ->
                    TvCard(
                        onClick = {
                            // Multi-moshaf reciters pick the mushaf first (the
                            // chooser opens on Home once search closes).
                            if (!vm.requestMoshafSelection(reciter)) {
                                reciter.moshafs.firstOrNull()?.let {
                                    navigator.push(Screen.SurahGrid(reciter, it))
                                }
                            }
                            vm.closeSearch()
                            onClose()
                        },
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
