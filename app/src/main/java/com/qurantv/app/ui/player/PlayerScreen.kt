package com.qurantv.app.ui.player

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.di.AppContainer
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.ErrorState
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.window.Dialog
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items

private val highlightColors = listOf(
    Color(0xFFFFD54F), // gold
    Color(0xFF81C784), // green
    Color(0xFF4FC3F7), // cyan
)

private val fontSizeSpByIndex = mapOf(0 to 22, 1 to 26, 2 to 32)

@Composable
fun PlayerScreen(
    container: AppContainer,
    screen: Screen.Player,
    onBack: () -> Unit,
) {
    val vm = container.playerViewModel
    val viewState by vm.screen.collectAsState()
    val positionMs by container.playbackController.positionMs.collectAsState()
    val ui = viewState.ui
    val settings = viewState.settings
    val highlightColor = highlightColors[settings.highlightColorIndex.coerceIn(0, 2)]
    val fontSizeSp = fontSizeSpByIndex[settings.fontSizeIndex.coerceIn(0, 2)] ?: 26

    // Keep the player bound to the requested surah (e.g. after moshaf change).
    LaunchedEffect(screen.reciter.id, screen.moshaf.id, screen.surah.id) {
        vm.play(
            reciter = screen.reciter,
            moshaf = screen.moshaf,
            surah = screen.surah,
            availableSurahs = screen.availableSurahs,
            resumeFromSession = true,
        )
    }
    val playFocus = remember { FocusRequester() }
    val view = LocalView.current
    DisposableEffect(view) {
        val listener = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
            if (hasFocus) playFocus.requestFocus()
        }
        view.viewTreeObserver.addOnWindowFocusChangeListener(listener)
        onDispose { view.viewTreeObserver.removeOnWindowFocusChangeListener(listener) }
    }
    LaunchedEffect(Unit) {
        withFrameNanos { }
        playFocus.requestFocus()
    }

    // Page loading for mushaf mode (with next-page prefetch).
    val pageLoader = remember { container.pageImageLoader }
    var pageBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var pageViewBox by remember { mutableStateOf<com.qurantv.app.domain.ViewBox?>(null) }
    LaunchedEffect(ui.currentPageUrl) {
        val url = ui.currentPageUrl
        pageBitmap = null
        pageViewBox = null
        if (url != null) {
            val loaded = withContext(Dispatchers.IO) { pageLoader.load(url) }
            pageBitmap = loaded?.bitmap
            pageViewBox = loaded?.viewBox
            // Prefetch the next page (first entry on a different page after the current ayah).
            val timing = ui.timing
            val current = ui.currentAyahIndex
            if (timing != null && current >= 0) {
                val nextPage = timing.entries.firstOrNull { it.ayah > current && it.pageUrl != null && it.pageUrl != url }?.pageUrl
                if (nextPage != null && nextPage != url) {
                    withContext(Dispatchers.IO) { pageLoader.load(nextPage) }
                }
            }
        }
    }

    var jumpOpen by remember { mutableStateOf(false) }
    val isTextMode = settings.displayMode == 0
    val currentAyah = ui.timing?.entries?.getOrNull(ui.currentAyahIndex)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_MENU -> {
                            vm.toggleDisplayMode()
                            true
                        }
                        else -> false
                    }
                } else false
            },
    ) {
        // Top bar
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 20.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvIconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "back",
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = ui.surah?.nameAr ?: "",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(ui.reciter?.name, ui.moshaf?.name).joinToString(" • "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (ui.hasTiming.not()) {
                Text(
                    text = "no-timing",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            TvIconButton(onClick = { vm.toggleDisplayMode() }) {
                Icon(
                    imageVector = if (isTextMode) Icons.AutoMirrored.Filled.MenuBook else Icons.Filled.TextFields,
                    contentDescription = "toggle mode",
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
        }

        // Content
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (ui.error) {
                ErrorState(onRetry = { vm.retry() }, message = "audio-error")
            } else if (isTextMode) {
                TextModeList(
                    items = viewState.textItems,
                    currentIndex = ui.currentAyahIndex,
                    fontSizeSp = fontSizeSp,
                    highlightColor = highlightColor,
                    onSelect = { index -> vm.seekToAyah(index) },
                )
            } else {
                PageModeView(
                    bitmap = pageBitmap?.asImageBitmap(),
                    viewBox = pageViewBox,
                    polygon = currentAyah?.polygon,
                    highlightColor = highlightColor,
                )
            }
        }

        // Transport
        TransportBar(
            state = ui,
            positionMs = positionMs,
            playFocusRequester = playFocus,
            onTogglePlayPause = { vm.togglePlayPause() },
            onPrevAyah = { vm.previousAyah() },
            onNextAyah = { vm.nextAyah() },
            onPrevSurah = { vm.previousSurah() },
            onNextSurah = { vm.nextSurah() },
            onCycleRepeat = { vm.cycleRepeat() },
            onCycleSpeed = { vm.cycleSpeed() },
            onSeekBy = { delta -> container.playbackController.seekTo(positionMs + delta) },
            onOpenSurahJump = { jumpOpen = true },
            onToggleMode = { vm.toggleDisplayMode() },
        )
    }

    if (jumpOpen) {
        SurahJumpDialog(
            surahs = viewState.availableSurahs,
            currentSurahId = ui.surah?.id,
            onSelect = { surah ->
                jumpOpen = false
                vm.play(
                    reciter = screen.reciter,
                    moshaf = screen.moshaf,
                    surah = surah,
                    availableSurahs = viewState.availableSurahs,
                    resumeFromSession = false,
                )
            },
            onDismiss = { jumpOpen = false },
        )
    }
}

@Composable
private fun SurahJumpDialog(
    surahs: List<com.qurantv.app.domain.QuranSurah>,
    currentSurahId: Int?,
    onSelect: (com.qurantv.app.domain.QuranSurah) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        val dialogFocus = remember { FocusRequester() }
        LaunchedEffect(Unit) {
    withFrameNanos { }
    dialogFocus.requestFocus()
}
        Column(
            modifier = Modifier
                .width(660.dp)
                .background(com.qurantv.app.ui.theme.SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
        ) {
            Text(
                text = "surah-jump",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.width(16.dp))
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
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = "${surah.id} — ${surah.nameAr}",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
