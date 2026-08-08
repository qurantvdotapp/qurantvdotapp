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
import androidx.compose.runtime.mutableLongStateOf
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
import com.qurantv.app.ui.components.MushafPickerDialog
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

    // ---- Two-page mushaf spread (with page-turn animation) ----
    val pageLoader = remember { container.pageImageLoader }
    val islamicLoader = remember { container.islamicNetworkPageLoader }
    val ksuLoader = remember { container.ksuPageLoader }
    val isKsuStyle = settings.mushafStyle == 3 || settings.mushafStyle == 4 || settings.mushafStyle == 5
    val isWarsh = settings.mushafStyle == 4
    val isTajweedPages = settings.mushafStyle == 5
    var spread by remember { mutableStateOf(SpreadState()) }
    val isTextMode = settings.displayMode == 0
    val isPageMode = !isTextMode

    // Look the current ayah's entry up by TIMING INDEX (reads may omit the
    // index-0 basmala entry, so list position ≠ timing index).
    val currentAyah = ui.timing?.entryFor(ui.currentAyahIndex)

    // Tajweed per-ayah image loading (style 1 — single image, not a spread).
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

    /** Page number for the current verse in the active pagination (null = none). */
    fun currentPageNumber(surahId: Int, ayahIndex: Int): Int? {
        if (isKsuStyle) {
            val key = com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
                ayahIndex, surahId, ui.surah?.versesCount ?: 0, viewState.ayahOffset,
            ) ?: return null
            if (isWarsh || isTajweedPages) {
                val parts = key.split(':')
                if (parts.size != 2) return null
                val s = parts[0].toInt(); val a = parts[1].toInt()
                return if (isWarsh) com.qurantv.app.domain.KsuWarshPageData.warshPageFor(s, a)
                else com.qurantv.app.domain.KsuTajweedPageData.tajweedPageFor(s, a)
            }
            return ui.currentPageUrl?.substringAfterLast('/')?.substringBefore('.')?.toIntOrNull()
        }
        return ui.currentPageUrl?.substringAfterLast('/')?.substringBefore('.')?.toIntOrNull()
    }

    /** Ayah numbers of the current surah that fall on [page] in the active pagination. */
    fun ksuPageAyahs(page: Int, surahId: Int, versesCount: Int): List<Int> {
        if (isWarsh || isTajweedPages) {
            val first = (if (isWarsh) com.qurantv.app.domain.KsuWarshPageData.pageFirst(page)
                else com.qurantv.app.domain.KsuTajweedPageData.pageFirst(page)) ?: return emptyList()
            val last = (if (isWarsh) com.qurantv.app.domain.KsuWarshPageData.pageLast(page)
                else com.qurantv.app.domain.KsuTajweedPageData.pageLast(page)) ?: return emptyList()
            val firstS = first / 1000; val firstA = first % 1000
            val lastS = last / 1000; val lastA = last % 1000
            if (surahId !in firstS..lastS) return emptyList()
            val a1 = if (surahId == firstS) firstA else 1
            val a2 = if (surahId == lastS) lastA else versesCount
            return (a1..a2).toList()
        }
        return ui.timing?.entries?.filter { it.pageUrl == ui.currentPageUrl }?.map { it.ayah } ?: emptyList()
    }

    val currentVerseKey =
        if (isPageMode && settings.mushafStyle != 1 && ui.surah != null && ui.currentAyahIndex > 0) {
            com.qurantv.app.domain.BasmalaOffset.verseKeyFor(
                ui.currentAyahIndex,
                ui.surah.id,
                ui.surah.versesCount,
                viewState.ayahOffset,
            )
        } else {
            null
        }

    /** Loads one side of the spread (bitmap + the current-ayah highlight when [isCurrent]). */
    suspend fun loadSpreadSide(page: Int, isCurrent: Boolean, surah: com.qurantv.app.domain.QuranSurah): SpreadSide =
        when (settings.mushafStyle) {
            0 -> {
                val url = "https://www.mp3quran.net/api/quran_pages_svg/${page.toString().padStart(3, '0')}.svg"
                val loaded = withContext(Dispatchers.IO) { pageLoader.load(url) }
                SpreadSide(
                    bitmap = loaded?.bitmap?.asImageBitmap(),
                    viewBox = loaded?.viewBox,
                    polygon = if (isCurrent) currentAyah?.polygon else null,
                )
            }
            2 -> {
                val loaded = withContext(Dispatchers.IO) { islamicLoader.load(page) }
                SpreadSide(
                    bitmap = loaded?.bitmap?.asImageBitmap(),
                    viewBox = loaded?.viewBox,
                    rects = if (isCurrent) loaded?.rectsByVerse?.get(currentVerseKey) else null,
                )
            }
            else -> {
                val kind = when {
                    isWarsh -> com.qurantv.app.ui.player.KsuPageLoader.Kind.WARSH
                    isTajweedPages -> com.qurantv.app.ui.player.KsuPageLoader.Kind.TAJWEED
                    else -> com.qurantv.app.ui.player.KsuPageLoader.Kind.HAFS
                }
                val loaded = withContext(Dispatchers.IO) { ksuLoader.load(page, kind) }
                val mushaf = when (kind) {
                    com.qurantv.app.ui.player.KsuPageLoader.Kind.WARSH -> "warsh"
                    com.qurantv.app.ui.player.KsuPageLoader.Kind.TAJWEED -> "tajweed"
                    else -> "hafs"
                }
                val meta = when (kind) {
                    com.qurantv.app.ui.player.KsuPageLoader.Kind.WARSH -> com.qurantv.app.domain.KsuHiliteGeometry.WARSH
                    com.qurantv.app.ui.player.KsuPageLoader.Kind.TAJWEED -> com.qurantv.app.domain.KsuHiliteGeometry.TAJWEED
                    else -> com.qurantv.app.domain.KsuHiliteGeometry.HAFS
                }
                var rects: List<com.qurantv.app.domain.KsuHiliteGeometry.Rect>? = null
                var bands: List<com.qurantv.app.domain.PageAyahBand>? = null
                if (isCurrent && loaded != null) {
                    val positions = container.ksuHilitesRepository.positionsFor(mushaf, page)
                    if (positions != null) {
                        val map = com.qurantv.app.domain.KsuHiliteGeometry.build(
                            ayahs = positions.map {
                                com.qurantv.app.domain.KsuHiliteGeometry.AyahEnd(it.surah, it.ayah, it.x, it.y)
                            },
                            page = page,
                            meta = meta,
                            imageWidth = loaded.width,
                            imageHeight = loaded.height,
                        )
                        rects = currentVerseKey?.let { map[it] }
                        android.util.Log.d("QuranTv", "ksu EXACT rects page $page ($mushaf): ${map.size} ayahs")
                    } else {
                        // Offline fallback: text-length estimate.
                        val ayahs = ksuPageAyahs(page, surah.id, surah.versesCount)
                        if (ayahs.isNotEmpty()) {
                            val lengths = ayahs.map { a -> container.quranTextRepository.verseTextLength(surah.id, a) }
                            val startsSurah = when {
                                isWarsh -> com.qurantv.app.domain.KsuWarshPageData.pageStartsSurah(page)
                                isTajweedPages -> com.qurantv.app.domain.KsuTajweedPageData.pageStartsSurah(page)
                                else -> page == surah.startPage
                            }
                            val estimated = com.qurantv.app.domain.PageAyahEstimator.estimate(ayahs, lengths, startsSurah)
                            bands = estimated[ui.currentAyahIndex]?.let { listOf(it) }
                            android.util.Log.d("QuranTv", "ksu estimated bands page $page: ${ayahs.size} ayahs")
                        }
                    }
                }
                SpreadSide(
                    bitmap = loaded?.asImageBitmap(),
                    rects = rects,
                    bands = bands,
                    bandsFractional = bands != null,
                )
            }
        }

    // Load the spread for the current page; prefetch the next spread.
    LaunchedEffect(ui.currentPageUrl, settings.mushafStyle, ui.currentAyahIndex, ui.surah?.id) {
        if (!isPageMode || settings.mushafStyle == 1 || ui.surah == null || ui.currentAyahIndex <= 0) {
            spread = SpreadState()
            return@LaunchedEffect
        }
        val surah = ui.surah
        val P = currentPageNumber(surah.id, ui.currentAyahIndex) ?: return@LaunchedEffect
        val rightPage = if (P % 2 == 1) P else P - 1
        val leftPage = rightPage + 1
        val right = loadSpreadSide(rightPage, isCurrent = P == rightPage, surah = surah)
        val left = loadSpreadSide(leftPage, isCurrent = P == leftPage, surah = surah)
        spread = SpreadState(right = right, left = left, key = rightPage)
        // Prefetch the next spread's pages.
        val nextRight = rightPage + 2
        if (nextRight <= 604) {
            loadSpreadSide(nextRight, false, surah)
            loadSpreadSide(nextRight + 1, false, surah)
        }
    }

    var jumpOpen by remember { mutableStateOf(false) }
    var mushafPickerOpen by remember { mutableStateOf(false) }

    // Page mode maximizes the mushaf: chrome (top bar + transport) auto-hides a
    // few seconds after the LAST key press while playing (the timer resets on
    // every button press, so navigating the controls never hides them), so the
    // spread fills the screen.
    var chromeVisible by remember { mutableStateOf(true) }
    var lastKeyPress by remember { mutableLongStateOf(0L) }
    val pageFocus = remember { FocusRequester() }
    LaunchedEffect(isPageMode, ui.isPlaying, chromeVisible, settings.autoHideControls, lastKeyPress) {
        if (isPageMode && ui.isPlaying && chromeVisible && settings.autoHideControls) {
            kotlinx.coroutines.delay(8_000)
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(com.qurantv.app.ui.theme.BackgroundBrush)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown) {
                    // Every key press resets the auto-hide countdown.
                    lastKeyPress++
                    when (event.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_MENU -> {
                            vm.toggleDisplayMode()
                            true
                        }
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            // Seeking is done with the prev/next ayah + surah
                            // buttons; any key here just reveals the chrome.
                            chromeVisible = true
                            false
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
                if (settings.mushafStyle == 1) {
                    TajweedAyahView(
                        bitmap = tajweedBitmap,
                        highlightColor = highlightColor,
                        showBasmala = ui.currentAyahIndex <= 0,
                    )
                } else {
                    MushafSpreadView(spread = spread, highlightColor = highlightColor)
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
                    MushafSpreadView(spread = spread, highlightColor = highlightColor)
                }
            }
        }

        // Transport
        val mushafLabel = when (settings.mushafStyle) {
            1 -> stringResource(R.string.mushaf_tajweed)
            2 -> stringResource(R.string.mushaf_madinah_hd)
            3 -> stringResource(R.string.mushaf_ayat_hafs)
            4 -> stringResource(R.string.mushaf_ayat_warsh)
            5 -> stringResource(R.string.mushaf_hafs_tajweed)
            else -> stringResource(R.string.mushaf_madinah)
        }
        TransportBar(
            state = ui,
            positionMs = positionMs,
            mushafLabel = mushafLabel,
            autoHideEnabled = settings.autoHideControls,
            playFocusRequester = playFocus,
            onTogglePlayPause = { vm.togglePlayPause() },
            onPrevAyah = { vm.previousAyah() },
            onNextAyah = { vm.nextAyah() },
            onPrevSurah = { vm.previousSurah() },
            onNextSurah = { vm.nextSurah() },
            onCycleRepeat = { vm.cycleRepeat() },
            onCycleSpeed = { vm.cycleSpeed() },
            onOpenSurahJump = { jumpOpen = true },
            onOpenMushafPicker = { mushafPickerOpen = true },
            onToggleAutoHide = { vm.toggleAutoHideControls() },
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

    if (mushafPickerOpen) {
        MushafPickerDialog(
            currentStyle = settings.mushafStyle,
            onSelect = { style ->
                mushafPickerOpen = false
                vm.selectMushafStyle(style)
            },
            onDismiss = { mushafPickerOpen = false },
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

