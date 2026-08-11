package com.qurantv.app.ui.player

import android.view.KeyEvent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import android.view.ViewTreeObserver
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.di.AppContainer
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.components.ErrorState
import com.qurantv.app.ui.components.MoshafSelectionDialog
import com.qurantv.app.ui.components.MushafPickerDialog
import com.qurantv.app.ui.components.ReciterPickerDialog
import com.qurantv.app.ui.components.SurahJumpDialog
import com.qurantv.app.ui.player.TajweedAyahView
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import androidx.compose.ui.window.Dialog

private val highlightColors = listOf(
    Color(0xFFFFD54F), // gold
    Color(0xFF81C784), // green
    Color(0xFF4FC3F7), // cyan
)

/** Translucent scrim behind the overlay top bar / transport in page mode. */
private val ChromeScrim = Color.Black.copy(alpha = 0.62f)

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

    // Keep the TV's screensaver (daydream) away while playback is active: the
    // system idle timer would otherwise fire after a few minutes of no D-pad
    // input (the chrome auto-hides), dimming to the backdrop even though the
    // audio is playing. FLAG_KEEP_SCREEN_ON needs no permission; it is cleared
    // on pause and when leaving the player.
    DisposableEffect(ui.isPlaying) {
        view.keepScreenOn = ui.isPlaying
        onDispose { view.keepScreenOn = false }
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
    // Manual mushaf browsing when the surah has NO ayah timing: the spread shows
    // the surah's first page statically and prev/next ayah turn the page instead.
    var noTimingPage by remember { mutableStateOf<Int?>(null) }
    // Side view selector: the mushaf spread is ALWAYS shown; the other views
    // (simplified tafseer / word meanings / translation) appear as an optional
    // side panel chosen from the top-bar dropdown (MUSHAF = mushaf only).
    var viewMode by remember { mutableStateOf(PlayerViewMode.MUSHAF) }
    var viewPickerOpen by remember { mutableStateOf(false) }
    var contentItems by remember { mutableStateOf<List<SurahContentRow>>(emptyList()) }
    val isTextMode = settings.displayMode == 0
    val isPageMode = !isTextMode

    // Look the current ayah's entry up by TIMING INDEX (reads may omit the
    // index-0 basmala entry, so list position ≠ timing index).
    val currentAyah = ui.timing?.entryFor(ui.currentAyahIndex)

    // Load the full-surah content for the selected non-mushaf view.
    LaunchedEffect(viewMode, ui.surah?.id, ui.surah?.versesCount, viewState.ayahOffset) {
        contentItems = emptyList()
        val surah = ui.surah ?: return@LaunchedEffect
        if (viewMode == PlayerViewMode.MUSHAF) return@LaunchedEffect
        val mode = when (viewMode) {
            PlayerViewMode.TAFSEER -> com.qurantv.app.data.repo.TafseerRepository.ContentMode.TAFSEER
            PlayerViewMode.MEANINGS -> com.qurantv.app.data.repo.TafseerRepository.ContentMode.MEANINGS
            PlayerViewMode.TRANSLATION -> com.qurantv.app.data.repo.TafseerRepository.ContentMode.TRANSLATION
            PlayerViewMode.MUSHAF -> return@LaunchedEffect
        }
        val content = container.tafseerRepository.surahContent(surah.id, mode) ?: return@LaunchedEffect
        val offset = viewState.ayahOffset
        val rowCount = ui.timing?.let { it.lastAyahIndex + 1 } ?: (surah.versesCount + 1)
        val rows = ArrayList<SurahContentRow>((rowCount - 1).coerceAtLeast(0))
        for (i in 1 until rowCount) {
            val key = com.qurantv.app.domain.BasmalaOffset.verseKeyFor(i, surah.id, surah.versesCount, offset)
            val verse = key?.substringAfter(':')?.toIntOrNull()
            val text = verse?.let { content[it] }?.replace("<br>", "\n")?.replace("<br/>", "\n")?.replace("<br />", "\n") ?: ""
            // Skip ayahs with no content for this mode (e.g. a word-meaning
            // entry can be empty) — an empty row adds no context.
            if (text.isNotBlank()) {
                rows += SurahContentRow(index = i, verseNumber = verse?.toString(), text = text)
            }
        }
        contentItems = rows
    }

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

    /** The first page of the surah in the active pagination (used without timing). */
    fun firstPageOfSurah(surah: com.qurantv.app.domain.QuranSurah): Int? = when (settings.mushafStyle) {
        4 -> com.qurantv.app.domain.KsuWarshPageData.warshPageFor(surah.id, 1)
        5 -> com.qurantv.app.domain.KsuTajweedPageData.tajweedPageFor(surah.id, 1)
        else -> surah.startPage // styles 0, 2, 3 — standard Madinah pagination
    }

    // Load the spread for the current page; prefetch the next spread.
    // Without reliable timing (no match, or the mp3 does not match the timing),
    // the surah's FIRST page is shown statically — no highlight, no page turn:
    // ayah boundaries are never estimated. The user can still browse the mushaf
    // page by page with the prev/next ayah buttons ([noTimingPage]).
    LaunchedEffect(ui.currentPageUrl, settings.mushafStyle, ui.currentAyahIndex, ui.surah?.id, ui.hasTiming, noTimingPage) {
        if (!isPageMode || settings.mushafStyle == 1 || ui.surah == null) {
            spread = SpreadState()
            return@LaunchedEffect
        }
        val surah = ui.surah
        val track = ui.hasTiming && ui.currentAyahIndex > 0
        val P = (if (track) currentPageNumber(surah.id, ui.currentAyahIndex) else (noTimingPage ?: firstPageOfSurah(surah)))
            ?: return@LaunchedEffect
        val rightPage = if (P % 2 == 1) P else P - 1
        val leftPage = rightPage + 1
        val right = loadSpreadSide(rightPage, isCurrent = track && P == rightPage, surah = surah)
        val left = loadSpreadSide(leftPage, isCurrent = track && P == leftPage, surah = surah)
        spread = SpreadState(right = right, left = left, key = rightPage)
        // Prefetch the next spread's pages (only when tracking — the static
        // fallback never turns pages).
        if (track) {
            val nextRight = rightPage + 2
            if (nextRight <= 604) {
                loadSpreadSide(nextRight, false, surah)
                loadSpreadSide(nextRight + 1, false, surah)
            }
        }
    }

    // The page number of the currently highlighted ayah — the SINGLE mushaf page
    // shown beside the context panel (the split view shows one page instead of
    // the two-page spread so each half gets maximum screen space).
    val currentSinglePage: Int? =
        if (isPageMode && settings.mushafStyle != 1 && ui.surah != null) {
            val track = ui.hasTiming && ui.currentAyahIndex > 0
            if (track) currentPageNumber(ui.surah.id, ui.currentAyahIndex)
            else noTimingPage ?: firstPageOfSurah(ui.surah)
        } else {
            null
        }

    var jumpOpen by remember { mutableStateOf(false) }
    var mushafPickerOpen by remember { mutableStateOf(false) }
    var reciterPickerOpen by remember { mutableStateOf(false) }
    // Reciter chosen in the picker that still needs a mushaf (multi-moshaf).
    var pendingReciter by remember { mutableStateOf<com.qurantv.app.domain.Reciter?>(null) }
    var allReciters by remember { mutableStateOf<List<com.qurantv.app.domain.Reciter>>(emptyList()) }
    // Normalized folder URLs of every read with ayah timing — used to mark
    // reciters/moshafs/surahs that have no timing data.
    var timedServers by remember { mutableStateOf<Set<String>>(emptySet()) }
    var untimedSurahs by remember { mutableStateOf<Set<Int>>(emptySet()) }
    LaunchedEffect(Unit) {
        allReciters = runCatching { container.catalogRepository.reciters("ar").first() }.getOrDefault(emptyList())
        timedServers = runCatching { container.timingRepository.timedServerUrls() }.getOrDefault(emptySet())
    }
    LaunchedEffect(ui.moshaf?.id, ui.surah?.id) {
        val moshaf = ui.moshaf ?: return@LaunchedEffect
        val read = runCatching { container.timingRepository.readForMoshaf(moshaf.server) }.getOrNull()
        if (read == null) {
            // No timing read at all → every available surah is untimed.
            untimedSurahs = viewState.availableSurahs.map { it.id }.toSet()
        } else {
            val timed = runCatching { container.timingRepository.surahsWithTiming(read.id) }.getOrNull()
            untimedSurahs = if (timed == null) {
                emptySet() // unknown — graceful
            } else {
                viewState.availableSurahs.filter { it.id !in timed }.map { it.id }.toSet()
            }
        }
    }

    // Page mode maximizes the mushaf: chrome (top bar + transport) auto-hides 5 s
    // after the LAST key press while playing (the timer resets on every button
    // press, so navigating the controls never hides them), so the spread fills
    // the screen.
    var chromeVisible by remember { mutableStateOf(true) }
    var lastKeyPress by remember { mutableLongStateOf(0L) }
    val pageFocus = remember { FocusRequester() }
    LaunchedEffect(isPageMode, ui.isPlaying, chromeVisible, settings.autoHideControls, lastKeyPress) {
        if (isPageMode && ui.isPlaying && chromeVisible && settings.autoHideControls) {
            kotlinx.coroutines.delay(5_000)
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
        // Transport helpers shared by text mode (normal layout) and page mode
        // (translucent overlay).
        val mushafLabel = when (settings.mushafStyle) {
            1 -> stringResource(R.string.mushaf_tajweed)
            2 -> stringResource(R.string.mushaf_madinah_hd)
            3 -> stringResource(R.string.mushaf_ayat_hafs)
            4 -> stringResource(R.string.mushaf_ayat_warsh)
            5 -> stringResource(R.string.mushaf_hafs_tajweed)
            else -> stringResource(R.string.mushaf_madinah)
        }
        // Without ayah timing the prev/next ayah buttons browse the mushaf page
        // by page instead (the spread is static — this is the only navigation).
        // Each press turns a full spread (two pages) so the view always advances.
        fun stepNoTimingPage(delta: Int) {
            val base = noTimingPage ?: firstPageOfSurah(ui.surah ?: return) ?: return
            noTimingPage = (base + delta).coerceIn(1, 604)
        }
        val canBrowsePages = isPageMode && settings.mushafStyle != 1 && !ui.hasTiming

        @Composable
        fun PlayerTransport() {
            TransportBar(
                state = ui,
                positionMs = positionMs,
                mushafLabel = mushafLabel,
                autoHideEnabled = settings.autoHideControls,
                playFocusRequester = playFocus,
                onTogglePlayPause = { vm.togglePlayPause() },
                onPrevAyah = { if (canBrowsePages) stepNoTimingPage(-2) else vm.previousAyah() },
                onNextAyah = { if (canBrowsePages) stepNoTimingPage(2) else vm.nextAyah() },
                onPrevSurah = { vm.previousSurah() },
                onNextSurah = { vm.nextSurah() },
                onCycleRepeat = { vm.cycleRepeat() },
                onCycleSpeed = { vm.cycleSpeed() },
                onOpenSurahJump = { jumpOpen = true },
                onOpenMushafPicker = { mushafPickerOpen = true },
                onOpenReciterPicker = { reciterPickerOpen = true },
                onToggleAutoHide = { vm.toggleAutoHideControls() },
            )
        }

        @Composable
        fun PlayerTopBar(modifier: Modifier = Modifier, showViewPicker: Boolean = false) {
            Row(
                modifier = modifier.padding(start = 32.dp, end = 32.dp, top = 10.dp, bottom = 4.dp),
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
                if (showViewPicker) {
                    TvCard(
                        onClick = { viewPickerOpen = true },
                        backgroundColor = com.qurantv.app.ui.theme.SurfaceContainer,
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        Text(
                            text = viewLabel(viewMode),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        if (isTextMode) {
            // Text mode keeps a normal layout: bars above/below the verse list.
            PlayerTopBar()
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (ui.error) {
                    ErrorState(onRetry = { vm.retry() }, message = stringResource(R.string.error_audio))
                } else {
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
                }
            }
            PlayerTransport()
        } else {
            // Page mode: the mushaf always fills the screen and the chrome (top
            // bar + transport) is a translucent OVERLAY that appears on a key press
            // and auto-hides after a few seconds.
            Box(
                Modifier
                    .fillMaxSize()
                    .then(
                        if (chromeVisible) Modifier
                        else Modifier.focusRequester(pageFocus).focusable()
                    ),
            ) {
                if (ui.error) {
                    ErrorState(onRetry = { vm.retry() }, message = stringResource(R.string.error_audio))
                } else if (viewMode == PlayerViewMode.MUSHAF) {
                    // Mushaf only — the spread (or the tajweed ayah image for
                    // style 1) fills the whole screen, no side panel.
                    if (settings.mushafStyle == 1) {
                        TajweedAyahView(
                            bitmap = tajweedBitmap,
                            highlightColor = highlightColor,
                            showBasmala = ui.currentAyahIndex <= 0,
                        )
                    } else {
                        MushafSpreadView(spread = spread, highlightColor = highlightColor)
                    }
                } else {
                    // The mushaf page is ALWAYS on screen (with the highlighted
                    // ayah); the chosen view (tafseer / meanings / translation)
                    // is an OPTIONAL side panel — the viewer sees the ayah and
                    // its context at the same time. Forced RTL keeps the mushaf
                    // on the right in both UI languages (it reads right-to-left).
                    // The screen is split HALF AND HALF to maximise space: the
                    // mushaf side shows only the CURRENT page (not the spread),
                    // the other half shows the context.
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                        Row(Modifier.fillMaxSize()) {
                            Box(Modifier.weight(1f).fillMaxHeight()) {
                                if (settings.mushafStyle == 1) {
                                    TajweedAyahView(
                                        bitmap = tajweedBitmap,
                                        highlightColor = highlightColor,
                                        showBasmala = ui.currentAyahIndex <= 0,
                                    )
                                } else {
                                    SingleMushafPage(
                                        spread = spread,
                                        pageNumber = currentSinglePage,
                                        highlightColor = highlightColor,
                                    )
                                }
                            }
                            Box(
                                Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .background(com.qurantv.app.ui.theme.SurfaceContainerHigh),
                            ) {
                                SideContextPanel(
                                    mode = viewMode,
                                    items = contentItems,
                                    currentIndex = ui.currentAyahIndex,
                                    highlightColor = highlightColor,
                                    onSelect = { index -> vm.seekToAyah(index) },
                                    resetKey = "${viewMode.name}/${ui.surah?.id}",
                                    positionMs = positionMs,
                                    currentAyahStartMs = currentAyah?.startMs ?: 0L,
                                    currentAyahEndMs = currentAyah?.endMs ?: 0L,
                                    isPlaying = ui.isPlaying,
                                )
                            }
                        }
                    }
                }
                if (chromeVisible) {
                    PlayerTopBar(
                        showViewPicker = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.TopCenter)
                            .background(ChromeScrim),
                    )
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .background(ChromeScrim),
                    ) {
                        PlayerTransport()
                    }
                }
            }
        }
    }

    // Reset the manual page browse when the surah changes (or timing appears).
    LaunchedEffect(ui.surah?.id, ui.hasTiming) {
        noTimingPage = null
    }

    if (jumpOpen) {
        SurahJumpDialog(
            surahs = viewState.availableSurahs,
            currentSurahId = ui.surah?.id,
            untimedSurahIds = untimedSurahs,
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
            displayMode = settings.displayMode,
            currentStyle = settings.mushafStyle,
            onSelectDisplayMode = { mode ->
                mushafPickerOpen = false
                vm.setDisplayMode(mode)
            },
            onSelect = { style ->
                mushafPickerOpen = false
                vm.selectMushafStyle(style)
                vm.setDisplayMode(1) // picking a mushaf shows the mushaf page
            },
            onDismiss = { mushafPickerOpen = false },
        )
    }

    if (reciterPickerOpen) {
        ReciterPickerDialog(
            reciters = allReciters,
            currentReciterId = ui.reciter?.id,
            timedServers = timedServers,
            onSelect = { reciter ->
                reciterPickerOpen = false
                if (reciter.moshafs.size > 1) {
                    pendingReciter = reciter // pick the mushaf next
                } else {
                    reciter.moshafs.firstOrNull()?.let { vm.switchReciter(reciter, it) }
                }
            },
            onDismiss = { reciterPickerOpen = false },
        )
    }
    pendingReciter?.let { reciter ->
        MoshafSelectionDialog(
            moshafs = reciter.moshafs,
            currentIndex = null,
            timedServers = timedServers,
            onSelect = { index ->
                reciter.moshafs.getOrNull(index)?.let { vm.switchReciter(reciter, it) }
                pendingReciter = null
            },
            onDismiss = { pendingReciter = null },
        )
    }

    if (viewPickerOpen) {
        ViewModeDialog(
            currentMode = viewMode,
            onSelect = { mode ->
                viewPickerOpen = false
                viewMode = mode
            },
            onDismiss = { viewPickerOpen = false },
        )
    }
}

/** The page-area views selectable from the top bar. */
enum class PlayerViewMode { MUSHAF, TAFSEER, MEANINGS, TRANSLATION }

/** Short label for the view button in the top bar. */
@Composable
private fun viewLabel(mode: PlayerViewMode): String = when (mode) {
    PlayerViewMode.MUSHAF -> stringResource(R.string.view_mushaf_short)
    PlayerViewMode.TAFSEER -> stringResource(R.string.view_tafseer_short)
    PlayerViewMode.MEANINGS -> stringResource(R.string.view_meanings_short)
    PlayerViewMode.TRANSLATION -> stringResource(R.string.view_translation_short)
}

/** Chooser for the side view: the mushaf stays on screen; picking tafseer /
 *  word meanings / translation shows that content as a side panel beside it. */
@Composable
private fun ViewModeDialog(
    currentMode: PlayerViewMode,
    onSelect: (PlayerViewMode) -> Unit,
    onDismiss: () -> Unit,
) {
    data class Option(val mode: PlayerViewMode, val name: String)
    val options = listOf(
        Option(PlayerViewMode.MUSHAF, stringResource(R.string.view_mushaf)),
        Option(PlayerViewMode.TAFSEER, stringResource(R.string.view_tafseer)),
        Option(PlayerViewMode.MEANINGS, stringResource(R.string.view_meanings)),
        Option(PlayerViewMode.TRANSLATION, stringResource(R.string.view_translation)),
    )
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        val dialogFocus = remember { FocusRequester() }
        androidx.compose.runtime.LaunchedEffect(Unit) {
            repeat(8) {
                androidx.compose.runtime.withFrameNanos { }
                if (dialogFocus.requestFocus()) return@LaunchedEffect
                kotlinx.coroutines.delay(120)
            }
        }
        Column(
            modifier = Modifier
                .width(560.dp)
                .background(com.qurantv.app.ui.theme.SurfaceContainer, MaterialTheme.shapes.extraLarge)
                .padding(24.dp),
        ) {
            Text(
                text = stringResource(R.string.view_picker_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.view_side_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp).padding(top = 14.dp),
            ) {
                items(options, key = { it.mode }) { option ->
                    val selected = option.mode == currentMode
                    TvCard(
                        onClick = { onSelect(option.mode) },
                        modifier = if (option.mode == options.first().mode) {
                            Modifier.fillMaxWidth().focusRequester(dialogFocus)
                        } else {
                            Modifier.fillMaxWidth()
                        },
                        backgroundColor = if (selected) {
                            MaterialTheme.colorScheme.primaryContainer
                        } else {
                            com.qurantv.app.ui.theme.SurfaceContainerHigh
                        },
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                    ) {
                        Text(
                            text = (if (selected) "✓ " else "") + option.name,
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

/**
 * The optional side panel beside the always-visible mushaf: the chosen context
 * view (simplified tafseer / word meanings / translation) for the whole surah,
 * one ayah per row — the current ayah is highlighted and follows the recitation
 * (same auto-scroll behavior as the full-screen content view). [mode] is never
 * MUSHAF here (that selection means "mushaf only", no panel).
 */
@Composable
private fun SideContextPanel(
    mode: PlayerViewMode,
    items: List<SurahContentRow>,
    currentIndex: Int,
    highlightColor: Color,
    onSelect: (Int) -> Unit,
    resetKey: Any,
    positionMs: Long,
    currentAyahStartMs: Long,
    currentAyahEndMs: Long,
    isPlaying: Boolean,
) {
    Column(Modifier.fillMaxSize()) {
        Text(
            text = when (mode) {
                PlayerViewMode.TAFSEER -> stringResource(R.string.view_tafseer)
                PlayerViewMode.MEANINGS -> stringResource(R.string.view_meanings)
                else -> stringResource(R.string.view_translation)
            },
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 2.dp),
        )
        SurahContentView(
            items = items,
            currentIndex = currentIndex,
            highlightColor = highlightColor,
            onSelect = onSelect,
            resetKey = resetKey,
            modifier = Modifier.weight(1f),
            positionMs = positionMs,
            currentAyahStartMs = currentAyahStartMs,
            currentAyahEndMs = currentAyahEndMs,
            isPlaying = isPlaying,
            // The panel owns half the screen (same as the mushaf page), so rows
            // use the full text size.
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
            fontSizeSp = 20f,
            rowSpacing = 6.dp,
        )
    }
}

/**
 * The single mushaf page holding the currently highlighted ayah, shown beside
 * the context panel (mushaf-only mode keeps the full two-page spread). The page
 * is picked from the loaded spread by page parity (odd = right side, even =
 * left side — the same rule the spread uses); page changes crossfade.
 */
@Composable
private fun SingleMushafPage(
    spread: SpreadState,
    pageNumber: Int?,
    highlightColor: Color,
    modifier: Modifier = Modifier,
) {
    if (pageNumber == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "…",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }
    AnimatedContent(
        targetState = pageNumber,
        modifier = modifier,
        transitionSpec = { fadeIn(tween(250)) togetherWith fadeOut(tween(250)) },
    ) { page ->
        val side = if (page % 2 == 1) spread.right else spread.left
        PageModeView(
            bitmap = side?.bitmap,
            viewBox = side?.viewBox,
            polygon = side?.polygon,
            rects = side?.rects,
            bands = side?.bands,
            bandsFractional = side?.bandsFractional ?: false,
            highlightColor = highlightColor,
            modifier = Modifier.fillMaxSize(),
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
            fontFamily = com.qurantv.app.ui.theme.QuranFontFamily,
            fontSize = 30.sp,
            color = if (isCurrent) highlightColors[0] else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

