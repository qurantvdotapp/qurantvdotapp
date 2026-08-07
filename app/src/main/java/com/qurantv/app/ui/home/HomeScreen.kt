package com.qurantv.app.ui.home

import android.view.ViewTreeObserver
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NavigateNext
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalView
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
import com.qurantv.app.ui.theme.BackgroundBrush
import com.qurantv.app.ui.theme.HeroBrush
import com.qurantv.app.ui.theme.SurfaceContainer
import com.qurantv.app.ui.theme.SurfaceContainerHigh

/** Flat rows for the vertical reciter list (letter section headers + reciter rows). */
private sealed interface HomeRow {
    data class LetterHeader(val letter: String) : HomeRow
    data class Reciter(val reciter: com.qurantv.app.domain.Reciter) : HomeRow

    fun key(): String = when (this) {
        is LetterHeader -> "h-$letter"
        is Reciter -> "r-${reciter.id}"
    }
}

@Composable
fun HomeScreen(
    container: AppContainer,
    onOpenSettings: () -> Unit,
    onOpenSearch: () -> Unit,
) {
    val vm = container.homeViewModel
    val ui by vm.ui.collectAsState()
    val navigator = container.navigator

    val rows = remember(ui.letters, ui.recitersByLetter) {
        ui.letters.flatMap { letter ->
            listOf<HomeRow>(HomeRow.LetterHeader(letter)) +
                ui.recitersByLetter[letter].orEmpty().map { HomeRow.Reciter(it) }
        }
    }
    val letterIndex = remember(rows) {
        buildMap {
            rows.forEachIndexed { i, row ->
                if (row is HomeRow.LetterHeader) put(row.letter, i)
            }
        }
    }
    val listState = rememberLazyListState()

    val continueFocus = remember { FocusRequester() }
    val searchFocus = remember { FocusRequester() }

    // Initial focus: the search bar on a fresh install, otherwise the Continue card.
    val view = LocalView.current
    DisposableEffect(view) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (hasFocus) {
                if (ui.lastSession == null) searchFocus.requestFocus() else continueFocus.requestFocus()
            }
        }
        view.viewTreeObserver.addOnWindowFocusChangeListener(listener)
        onDispose { view.viewTreeObserver.removeOnWindowFocusChangeListener(listener) }
    }
    LaunchedEffect(ui.recitersLoading, ui.lastSession) {
        if (!ui.recitersLoading) {
            repeat(8) {
                withFrameNanos { }
                val target = if (ui.lastSession == null) searchFocus else continueFocus
                if (target.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(150)
            }
        }
    }

    // Jump rail → scroll the vertical list to the chosen letter.
    LaunchedEffect(ui.selectedLetter) {
        ui.selectedLetter?.let { letter ->
            letterIndex[letter]?.let { idx ->
                if (listState.firstVisibleItemIndex != idx) listState.animateScrollToItem(idx)
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(BackgroundBrush)
            .padding(start = 40.dp, end = 40.dp),
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.displayMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.weight(1f))
            TvIconButton(onClick = onOpenSettings) {
                Icon(Icons.Filled.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
        }

        // Search bar (always visible)
        SearchBar(focusRequester = searchFocus, onClick = onOpenSearch)

        // Continue listening hero
        ContinueCard(session = ui.lastSession, focusRequester = continueFocus, onPlay = {
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
        })

        when {
            ui.recitersLoading && ui.reciters.isEmpty() -> {
                LoadingState(Modifier.weight(1f))
            }
            ui.recitersError && ui.reciters.isEmpty() -> {
                ErrorState(onRetry = { vm.retry() }, modifier = Modifier.weight(1f))
            }
            else -> {
                // Section title
                Text(
                    text = stringResource(R.string.reciters_title),
                    modifier = Modifier.padding(top = 14.dp, bottom = 8.dp),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Row(Modifier.weight(1f).fillMaxWidth()) {
                    // Vertical, searchable reciter list — uses the full height.
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        contentPadding = PaddingValues(bottom = 20.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(rows, key = { it.key() }) { row ->
                            when (row) {
                                is HomeRow.LetterHeader -> LetterHeader(row.letter)
                                is HomeRow.Reciter -> ReciterRow(
                                    reciter = row.reciter,
                                    onClick = {
                                        val moshaf = row.reciter.moshafs.firstOrNull()
                                        if (moshaf != null) navigator.push(Screen.SurahGrid(row.reciter, moshaf))
                                    },
                                )
                            }
                        }
                    }
                    Spacer(Modifier.width(16.dp))
                    LetterRail(
                        letters = ui.letters,
                        selected = ui.selectedLetter,
                        onSelect = vm::selectLetter,
                        modifier = Modifier.width(52.dp).fillMaxHeight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchBar(focusRequester: FocusRequester, onClick: () -> Unit) {
    TvCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
        backgroundColor = SurfaceContainerHigh,
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.Search,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(14.dp))
            Text(
                text = stringResource(R.string.search_hint),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ContinueCard(session: LastSession?, focusRequester: FocusRequester, onPlay: () -> Unit) {
    if (session == null) {
        TvCard(
            onClick = {},
            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester).padding(top = 10.dp),
            backgroundColor = SurfaceContainer,
            contentPadding = PaddingValues(horizontal = 22.dp, vertical = 14.dp),
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
        modifier = Modifier.fillMaxWidth().focusRequester(focusRequester).padding(top = 10.dp),
        backgroundBrush = HeroBrush,
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.continue_listening),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "${session.reciterName} • ${session.surahNameAr}",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PlayArrow,
                    contentDescription = null,
                    modifier = Modifier.size(30.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}

@Composable
private fun LetterHeader(letter: String) {
    Text(
        text = letter,
        modifier = Modifier.padding(start = 4.dp, top = 10.dp, bottom = 2.dp),
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun ReciterRow(reciter: Reciter, onClick: () -> Unit) {
    TvCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        backgroundColor = SurfaceContainer,
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = reciter.letter ?: "؟",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
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
            Icon(
                Icons.AutoMirrored.Filled.NavigateNext,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun LetterRail(
    letters: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        items(letters, key = { it }) { letter ->
            val isSelected = letter == selected
            TvCard(
                onClick = { onSelect(letter) },
                shape = RoundedCornerShape(10.dp),
                backgroundColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer else SurfaceContainer,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 7.dp),
            ) {
                Text(
                    text = letter,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
