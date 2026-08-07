package com.qurantv.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.data.repo.LastSession
import com.qurantv.app.di.AppContainer
import com.qurantv.app.domain.Reciter
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.ErrorState
import com.qurantv.app.ui.components.LoadingState
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton

@Composable
fun HomeScreen(
    container: AppContainer,
    onOpenSettings: () -> Unit,
    onOpenSearch: () -> Unit,
) {
    val vm = container.homeViewModel
    val ui by vm.ui.collectAsState()
    val navigator = container.navigator
    val initialFocus = remember { FocusRequester() }

    // Initial focus when the window actually gains focus (reliable on TV),
    // so the first DPAD_CENTER activates immediately.
    val view = LocalView.current
    DisposableEffect(view) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (hasFocus) initialFocus.requestFocus()
        }
        view.viewTreeObserver.addOnWindowFocusChangeListener(listener)
        onDispose { view.viewTreeObserver.removeOnWindowFocusChangeListener(listener) }
    }
    LaunchedEffect(ui.recitersLoading, ui.lastSession) {
        if (!ui.recitersLoading) {
            // Retry until the Continue card is composed and focusable — cold-start
            // focus is otherwise racy on TV.
            repeat(8) {
                withFrameNanos { }
                if (initialFocus.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(150)
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 40.dp, end = 40.dp, top = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.displayMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            TvIconButton(onClick = onOpenSearch) {
                Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.width(14.dp))
            TvIconButton(onClick = onOpenSettings) {
                Icon(Icons.Filled.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
        }

        when {
            ui.recitersLoading && ui.reciters.isEmpty() -> {
                LoadingState(Modifier.weight(1f))
            }
            ui.recitersError && ui.reciters.isEmpty() -> {
                ErrorState(onRetry = { vm.retry() }, modifier = Modifier.weight(1f))
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 40.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(22.dp),
                ) {
                    item(key = "continue") {
                        ContinueCard(
                            session = ui.lastSession,
                            focusRequester = initialFocus,
                            onPlay = {
                                val target = vm.continueTarget()
                                if (target != null) {
                                    val (reciter, moshaf, session) = target
                                    val available = vm.surahsFor(moshaf)
                                    val surah = available.firstOrNull { it.id == session.surahId }
                                    if (surah != null) {
                                        navigator.push(
                                            Screen.Player(
                                                reciter = reciter,
                                                moshaf = moshaf,
                                                surah = surah,
                                                availableSurahs = available,
                                            )
                                        )
                                    }
                                }
                            },
                        )
                    }
                    item(key = "reciters-header") {
                        Text(
                            text = stringResource(R.string.reciters_title),
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    item(key = "reciters") {
                        RecitersAtoZ(ui = ui, onSelectLetter = vm::selectLetter, onReciterClick = { reciter ->
                            val moshaf = reciter.moshafs.firstOrNull()
                            if (moshaf != null) {
                                navigator.push(Screen.SurahGrid(reciter, moshaf))
                            }
                        })
                    }
                    if (ui.recentReads.isNotEmpty()) {
                        item(key = "recent-header") {
                            Text(
                                text = stringResource(R.string.recent_reads),
                                style = MaterialTheme.typography.headlineMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        item(key = "recent") {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                items(ui.recentReads, key = { it.id }) { reciter ->
                                    ReciterCard(reciter = reciter, onClick = {
                                        val moshaf = reciter.moshafs.firstOrNull()
                                        if (moshaf != null) navigator.push(Screen.SurahGrid(reciter, moshaf))
                                    })
                                }
                            }
                        }
                    }
                    item(key = "bottom-pad") { Spacer(Modifier.height(8.dp)) }
                }
            }
        }
    }
}

@Composable
private fun ContinueCard(session: LastSession?, focusRequester: FocusRequester, onPlay: () -> Unit) {
    if (session == null) {
        TvCard(
            onClick = {},
            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
            backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer,
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 18.dp),
        ) {
            Text(
                text = stringResource(R.string.continue_hint),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    TvCard(
        onClick = onPlay,
        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
        backgroundColor = MaterialTheme.colorScheme.primaryContainer,
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 18.dp),
    ) {
        Text(
            text = stringResource(R.string.continue_listening),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Text(
            text = "${session.reciterName} • ${session.surahNameAr}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun RecitersAtoZ(
    ui: HomeUiState,
    onSelectLetter: (String) -> Unit,
    onReciterClick: (Reciter) -> Unit,
) {
    Row(Modifier.fillMaxWidth().height(340.dp)) {
        // Alphabet rail — left edge in LTR, right edge in RTL.
        LazyColumn(
            modifier = Modifier.width(64.dp).fillMaxHeight(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            items(ui.letters, key = { it }) { letter ->
                val selected = letter == ui.selectedLetter
                TvCard(
                    onClick = { onSelectLetter(letter) },
                    modifier = Modifier.padding(vertical = 3.dp),
                    shape = CircleShape,
                    backgroundColor = if (selected) MaterialTheme.colorScheme.primaryContainer
                    else com.qurantv.app.ui.theme.SurfaceContainer,
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    contentPadding = PaddingValues(10.dp),
                ) {
                    Text(
                        text = letter,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        Spacer(Modifier.width(20.dp))
        val reciters = ui.recitersByLetter[ui.selectedLetter].orEmpty()
        if (reciters.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.empty_reciters), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyRow(
                modifier = Modifier.weight(1f).fillMaxHeight(),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items(reciters, key = { it.id }) { reciter ->
                    ReciterCard(reciter = reciter, onClick = { onReciterClick(reciter) })
                }
            }
        }
    }
}

@Composable
private fun ReciterCard(reciter: Reciter, onClick: () -> Unit) {
    TvCard(
        onClick = onClick,
        modifier = Modifier.width(210.dp),
        backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer,
    ) {
        Text(
            text = reciter.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.moshafs_count, reciter.moshafs.size),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
