package com.qurantv.app.ui.player

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.TextFields
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.di.AppContainer
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.ErrorState
import com.qurantv.app.ui.components.SurahJumpDialog
import com.qurantv.app.ui.player.TajweedAyahView
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.window.Dialog

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
        repeat(8) {
            withFrameNanos { }
            if (playFocus.requestFocus()) return@LaunchedEffect
            kotlinx.coroutines.delay(150)
        }
    }

    // Page loading for mushaf mode (with next-page prefetch).
    val pageLoader = remember { container.pageImageLoader }
    var pageBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    var pageViewBox by remember { mutableStateOf<com.qurantv.app.domain.ViewBox?>(null) }
    // Tajweed per-ayah image loading (current ayah + prefetch of the next one).
    val ayahLoader = remember { container.ayahImageLoader }
    var tajweedBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(ui.currentAyahIndex, settings.mushafStyle, settings.displayMode) {
        if (settings.mushafStyle == 1 && settings.displayMode == 1 && ui.currentAyahIndex > 0 && ui.surah != null) {
            val verseKey = com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
                ui.currentAyahIndex,
                ui.surah.id,
                ui.surah.versesCount,
                viewState.ayahOffset,
            )
            val parts = verseKey?.split(':')
            if (parts != null && parts.size == 2) {
                val s = parts[0].toInt()
                val a = parts[1].toInt()
                tajweedBitmap = withContext(Dispatchers.IO) { ayahLoader.load(s, a) }
                // Prefetch the next ayah's image.
                val next = com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
                    ui.currentAyahIndex + 1,
                    ui.surah.id,
                    ui.surah.versesCount,
                    viewState.ayahOffset,
                )?.split(':')
                if (next != null && next.size == 2) {
                    withContext(Dispatchers.IO) { ayahLoader.load(next[0].toInt(), next[1].toInt()) }
                }
            }
        } else {
            tajweedBitmap = null
        }
    }
    LaunchedEffect(ui.currentPageUrl, settings.mushafStyle) {
        if (settings.mushafStyle == 2) return@LaunchedEffect // islamic.app path below
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

    // islamic.app Madinah pages (style 2): same standard pagination as the timing
    // `page` field; the per-ayah highlight comes from the page's own data-ayah lines.
    val islamicLoader = remember { container.islamicNetworkPageLoader }
    var islamicPage by remember { mutableStateOf<IslamicNetworkPageLoader.LoadedPage?>(null) }
    val currentVerseKey =
        if (settings.mushafStyle == 2 && ui.surah != null && ui.currentAyahIndex > 0) {
            com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
                ui.currentAyahIndex,
                ui.surah.id,
                ui.surah.versesCount,
                viewState.ayahOffset,
            )
        } else {
            null
        }
    LaunchedEffect(ui.currentPageUrl, settings.mushafStyle) {
        islamicPage = null
        if (settings.mushafStyle == 2) {
            val page = ui.currentPageUrl?.substringAfterLast('/')?.substringBefore('.')?.toIntOrNull()
            if (page != null) {
                islamicPage = withContext(Dispatchers.IO) { islamicLoader.load(page) }
                // Prefetch the next page.
                val timing = ui.timing
                val current = ui.currentAyahIndex
                if (timing != null && current >= 0) {
                    val nextPage = timing.entries
                        .firstOrNull { it.ayah > current && it.pageUrl != null && it.pageUrl != ui.currentPageUrl }
                        ?.pageUrl?.substringAfterLast('/')?.substringBefore('.')?.toIntOrNull()
                    if (nextPage != null) {
                        withContext(Dispatchers.IO) { islamicLoader.load(nextPage) }
                    }
                }
            }
        }
    }
    val currentBands = islamicPage?.bandsByVerse?.get(currentVerseKey)

    // KSU (Ayat) pages — styles 3 (Hafs) and 4 (Warsh). Hafs uses the standard
    // Madinah page from the timing data; Warsh maps the verse through its own
    // pagination. Raster PNGs: page-level sync only, plus a bottom text strip.
    val ksuLoader = remember { container.ksuPageLoader }
    val isKsuStyle = settings.mushafStyle == 3 || settings.mushafStyle == 4
    val isWarsh = settings.mushafStyle == 4
    var ksuBitmap by remember { mutableStateOf<android.graphics.Bitmap?>(null) }
    val currentAyahText = viewState.textItems.firstOrNull { it.index == ui.currentAyahIndex }?.text
    fun ksuPageFor(surahId: Int, ayahIndex: Int): Int? {
        val key = com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
            ayahIndex, surahId, ui.surah?.versesCount ?: 0, viewState.ayahOffset,
        ) ?: return null
        if (isWarsh) {
            val parts = key.split(':')
            if (parts.size != 2) return null
            return com.qurantv.app.domain.KsuWarshPageData.warshPageFor(parts[0].toInt(), parts[1].toInt())
        }
        // Hafs: the timing's standard Madinah page.
        return ui.currentPageUrl?.substringAfterLast('/')?.substringBefore('.')?.toIntOrNull()
    }
    LaunchedEffect(ui.currentPageUrl, settings.mushafStyle, ui.currentAyahIndex, ui.surah?.id) {
        ksuBitmap = null
        if (isKsuStyle && ui.surah != null && ui.currentAyahIndex > 0) {
            val page = ksuPageFor(ui.surah.id, ui.currentAyahIndex)
            if (page != null) {
                ksuBitmap = withContext(Dispatchers.IO) { ksuLoader.load(page, isWarsh) }
                // Prefetch the next page.
                val next = ksuPageFor(ui.surah.id, ui.currentAyahIndex + 1)
                if (next != null && next != page) {
                    withContext(Dispatchers.IO) { ksuLoader.load(next, isWarsh) }
                }
            }
        }
    }

    var jumpOpen by remember { mutableStateOf(false) }
    val isTextMode = settings.displayMode == 0
    val isPageMode = !isTextMode
    // Look the current ayah's entry up by TIMING INDEX (reads may omit the
    // index-0 basmala entry, so list position ≠ timing index).
    val currentAyah = ui.timing?.entryFor(ui.currentAyahIndex)

    // Page mode maximizes the mushaf: chrome (top bar + transport) auto-hides a
    // few seconds after the last key while playing, so the SVG fills the screen.
    var chromeVisible by remember { mutableStateOf(true) }
    val pageFocus = remember { FocusRequester() }
    LaunchedEffect(isPageMode, ui.isPlaying, chromeVisible) {
        if (isPageMode && ui.isPlaying && chromeVisible) {
            kotlinx.coroutines.delay(4_000)
            chromeVisible = false
        }
    }
    // Pausing reveals the chrome again; the fullscreen page itself holds focus
    // while hidden so D-pad keys still reach the screen-level handler.
    LaunchedEffect(ui.isPlaying) {
        if (!ui.isPlaying && isPageMode) chromeVisible = true
    }
    LaunchedEffect(chromeVisible) {
        if (chromeVisible) playFocus.requestFocus() else pageFocus.requestFocus()
    }

    // Shared page-mode content selection across the full-bleed and normal layouts.
    val pageModeBitmap = when (settings.mushafStyle) {
        2 -> islamicPage?.bitmap?.asImageBitmap()
        3, 4 -> ksuBitmap?.asImageBitmap()
        else -> pageBitmap?.asImageBitmap()
    }
    val pageModeViewBox = if (settings.mushafStyle == 2) islamicPage?.viewBox else pageViewBox
    val pageModePolygon = if (settings.mushafStyle == 2 || isKsuStyle) null else currentAyah?.polygon
    val pageModeBands = if (settings.mushafStyle == 2) currentBands else null

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(com.qurantv.app.ui.theme.BackgroundBrush)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_MENU -> {
                            vm.toggleDisplayMode()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // With the chrome hidden the mushaf fills the screen:
                            // left/right scrub the audio directly.
                            if (isPageMode && !chromeVisible) {
                                val delta = if (event.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_LEFT) -5_000 else 5_000
                                container.playbackController.seekTo(positionMs + delta)
                                true
                            } else {
                                chromeVisible = true
                                false
                            }
                        }
                        else -> {
                            if (isPageMode && !chromeVisible) chromeVisible = true
                            false
                        }
                    }
                } else false
            },
    ) {
        if (isPageMode && !chromeVisible) {
            // Chrome hidden: just the mushaf page, full-bleed (focusable so key
            // events keep flowing through the screen-level handler).
            Box(
                Modifier
                    .fillMaxSize()
                    .focusRequester(pageFocus)
                    .focusable(),
            ) {
                PageModeView(
                    bitmap = pageModeBitmap,
                    viewBox = pageModeViewBox,
                    polygon = pageModePolygon,
                    highlightColor = highlightColor,
                    bands = pageModeBands,
                )
                if (isKsuStyle) {
                    AyahTextStrip(
                        text = currentAyahText,
                        color = highlightColor,
                        modifier = Modifier.align(Alignment.BottomCenter),
                    )
                }
            }
        } else {
        // Top bar (compact to leave room for more ayahs)
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 32.dp, end = 32.dp, top = 10.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvIconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.back),
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = ui.surah?.nameAr ?: "",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = listOfNotNull(ui.reciter?.name, ui.moshaf?.name).joinToString(" • "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (ui.hasTiming.not()) {
                Text(
                    text = stringResource(R.string.no_timing_short),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            // Mushaf style cycle: Madinah → Tajweed → Madinah HD → Ayat Hafs → Ayat Warsh.
            TvIconButton(onClick = { vm.toggleMushafStyle() }) {
                Text(
                    text = when (settings.mushafStyle) {
                        1 -> "﷽"
                        2 -> "HD"
                        3 -> "KS"
                        4 -> "WS"
                        else -> "م"
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.width(8.dp))
            TvIconButton(onClick = { vm.toggleDisplayMode() }) {
                Icon(
                    imageVector = if (isTextMode) Icons.AutoMirrored.Filled.MenuBook else Icons.Filled.TextFields,
                    contentDescription = stringResource(R.string.display_mode),
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
        }

        // Content
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (ui.error) {
                ErrorState(onRetry = { vm.retry() }, message = stringResource(R.string.error_audio))
            } else if (isTextMode) {
                Column(Modifier.fillMaxSize()) {
                    // The recited basmala is its own audio segment (timing index 0),
                    // so it is shown as a surah header above the verse list and
                    // highlighted while it plays. Every surah starts with it except
                    // Al-Tawbah (9); surah 1's verse 1:1 IS the basmala (no header).
                    val surahId = ui.surah?.id
                    if (surahId != null && surahId != 1 && surahId != 9) {
                        BasmalaHeader(isCurrent = ui.currentAyahIndex == 0)
                    }
                    TextModeList(
                        items = viewState.textItems,
                        currentIndex = ui.currentAyahIndex,
                        fontSizeSp = fontSizeSp,
                        highlightColor = highlightColor,
                        onSelect = { index -> vm.seekToAyah(index) },
                        resetKey = screen.surah.id,
                        modifier = Modifier.weight(1f),
                        positionMs = positionMs,
                        currentAyahStartMs = currentAyah?.startMs ?: 0L,
                        currentAyahEndMs = currentAyah?.endMs ?: 0L,
                        isPlaying = ui.isPlaying,
                    )
                }
            } else if (settings.mushafStyle == 1) {
                TajweedAyahView(
                    bitmap = tajweedBitmap,
                    highlightColor = highlightColor,
                    showBasmala = ui.currentAyahIndex <= 0,
                )
            } else {
                Box(Modifier.fillMaxSize()) {
                    PageModeView(
                        bitmap = pageModeBitmap,
                        viewBox = pageModeViewBox,
                        polygon = pageModePolygon,
                        highlightColor = highlightColor,
                        bands = pageModeBands,
                    )
                    if (isKsuStyle) {
                        AyahTextStrip(
                            text = currentAyahText,
                            color = highlightColor,
                            modifier = Modifier.align(Alignment.BottomCenter),
                        )
                    }
                }
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

/**
 * Bottom strip showing the current ayah's text for raster page sources that
 * carry no per-ayah coordinates (KSU Hafs/Warsh pages) — keeps the recitation
 * readable while the page itself provides the mushaf context.
 */
@Composable
private fun AyahTextStrip(text: String?, color: Color, modifier: Modifier = Modifier) {
    if (text.isNullOrBlank()) return
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = 32.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            fontSize = 24.sp,
            lineHeight = 36.sp,
            color = color,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The recited basmala shown as a surah header above the verse list (timing index 0
 * is its own audio segment). Highlighted while it plays. Every surah starts with it
 * except Al-Tawbah (9); surah 1's verse 1:1 is the basmala itself, so no header.
 */
@Composable
private fun BasmalaHeader(isCurrent: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                if (isCurrent) highlightColors[0].copy(alpha = 0.18f)
                else Color.Transparent,
            )
            .padding(vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
            style = MaterialTheme.typography.bodyMedium,
            color = if (isCurrent) highlightColors[0] else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

