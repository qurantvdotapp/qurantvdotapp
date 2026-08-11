package com.qurantv.app.ui.surahs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.di.AppContainer
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.EmptyState
import com.qurantv.app.ui.components.ErrorState
import com.qurantv.app.ui.components.LoadingState
import com.qurantv.app.ui.components.MoshafSelectionDialog
import com.qurantv.app.ui.components.SurahJumpDialog
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton

@Composable
fun SurahGridScreen(
    container: AppContainer,
    screen: Screen.SurahGrid,
    onBack: () -> Unit,
) {
    val vm = container.surahGridViewModel
    val ui by vm.ui.collectAsState()
    val settings by container.settingsViewModel.settings.collectAsState()
    val navigator = container.navigator
    val isEnglish = settings.language == "en"
    var jumpOpen by remember { mutableStateOf(false) }

    LaunchedEffect(screen.reciter.id, screen.moshaf.id) {
        vm.open(screen.reciter, screen.moshaf)
    }
    val initialFocus = remember { FocusRequester() }
    val view = LocalView.current
    DisposableEffect(view) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (hasFocus && ui.surahs.isNotEmpty()) initialFocus.requestFocus()
        }
        view.viewTreeObserver.addOnWindowFocusChangeListener(listener)
        onDispose { view.viewTreeObserver.removeOnWindowFocusChangeListener(listener) }
    }
    LaunchedEffect(ui.surahs) {
        if (ui.surahs.isNotEmpty()) {
            repeat(8) {
                withFrameNanos { }
                if (initialFocus.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(150)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(com.qurantv.app.ui.theme.BackgroundBrush)) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 20.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvIconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = ui.reciter?.name ?: "",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = ui.moshaf?.name ?: "",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TvCard(onClick = { vm.togglePicker() }, backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer) {
                Text(
                    text = stringResource(R.string.change_moshaf),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.width(10.dp))
            TvCard(onClick = { jumpOpen = true }, backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer) {
                Text(
                    text = stringResource(R.string.surah_jump),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }

        when {
            ui.loading && ui.surahs.isEmpty() -> LoadingState(Modifier.weight(1f))
            ui.error && ui.surahs.isEmpty() -> ErrorState(
                onRetry = { ui.reciter?.let { r -> ui.moshaf?.let { m -> vm.open(r, m) } } },
                modifier = Modifier.weight(1f),
            )
            ui.surahs.isEmpty() -> EmptyState(Modifier.weight(1f), stringResource(R.string.empty_surahs))
            else -> SurahGrid(
                surahs = ui.surahs,
                isEnglish = isEnglish,
                untimedSurahIds = ui.untimedSurahIds,
                firstItemFocus = initialFocus,
                onSurahClick = { surah ->
                    ui.reciter?.let { reciter ->
                        ui.moshaf?.let { moshaf ->
                            navigator.push(
                                Screen.Player(
                                    reciter = reciter,
                                    moshaf = moshaf,
                                    surah = surah,
                                    availableSurahs = ui.surahs,
                                )
                            )
                        }
                    }
                },
                modifier = Modifier.weight(1f),
            )
        }
    }

    if (ui.pickerOpen) {
        ui.reciter?.let { reciter ->
            MoshafSelectionDialog(
                moshafs = reciter.moshafs,
                currentIndex = ui.moshafIndex,
                timedServers = ui.timedServerUrls,
                onSelect = { index ->
                    vm.selectMoshaf(index)
                    vm.togglePicker()
                },
                onDismiss = { vm.togglePicker() },
            )
        }
    }

    if (jumpOpen) {
        SurahJumpDialog(
            surahs = ui.surahs,
            currentSurahId = null,
            untimedSurahIds = ui.untimedSurahIds,
            onSelect = { surah ->
                jumpOpen = false
                ui.reciter?.let { reciter ->
                    ui.moshaf?.let { moshaf ->
                        navigator.push(
                            Screen.Player(
                                reciter = reciter,
                                moshaf = moshaf,
                                surah = surah,
                                availableSurahs = ui.surahs,
                            )
                        )
                    }
                }
            },
            onDismiss = { jumpOpen = false },
        )
    }
}

@Composable
private fun SurahGrid(
    surahs: List<QuranSurah>,
    isEnglish: Boolean,
    untimedSurahIds: Set<Int>,
    firstItemFocus: FocusRequester,
    onSurahClick: (QuranSurah) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(8),
        modifier = modifier.fillMaxWidth().padding(horizontal = 32.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(surahs, key = { it.id }) { surah ->
            TvCard(
                onClick = { onSurahClick(surah) },
                modifier = if (surah.id == surahs.first().id) {
                    Modifier.fillMaxWidth().focusRequester(firstItemFocus)
                } else {
                    Modifier.fillMaxWidth()
                },
                backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer,
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = surah.id.toString(),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.width(10.dp))
                    Column {
                        val untimed = surah.id in untimedSurahIds
                        Text(
                            text = surah.nameAr,
                            style = MaterialTheme.typography.titleMedium,
                            color = if (untimed) MaterialTheme.colorScheme.onSurfaceVariant
                            else MaterialTheme.colorScheme.onSurface,
                        )
                        if (isEnglish && !surah.nameEn.isNullOrBlank()) {
                            Text(
                                text = surah.nameEn,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (untimed) {
                            Text(
                                text = stringResource(R.string.no_timing_badge),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }
        }
    }
}
