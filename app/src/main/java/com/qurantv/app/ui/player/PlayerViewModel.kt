package com.qurantv.app.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.data.repo.SessionRepository
import com.qurantv.app.data.repo.TimingRepository
import com.qurantv.app.domain.BasmalaOffset
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import com.qurantv.app.domain.SurahTiming
import com.qurantv.app.player.PlaybackController
import com.qurantv.app.player.PlayerUiState
import com.qurantv.app.data.repo.QuranTextRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** One verse row of the text list. [index] is the timing ayah index (i >= 1). */
data class TextItem(
    val index: Int,
    val verseKey: String?,
    val text: String,
)

data class PlayerScreenUiState(
    val ui: PlayerUiState = PlayerUiState(),
    val textItems: List<TextItem> = emptyList(),
    val timingAvailable: Boolean = false,
    val ayahOffset: Int = 0,
    val settings: AppSettings = AppSettings(),
    val availableSurahs: List<QuranSurah> = emptyList(),
    val textLoading: Boolean = false,
)

class PlayerViewModel(
    private val playback: PlaybackController,
    private val timingRepository: TimingRepository,
    private val quranTextRepository: QuranTextRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _screen = MutableStateFlow(PlayerScreenUiState())
    val screen: StateFlow<PlayerScreenUiState> = _screen.asStateFlow()

    private var loadedKey: String? = null
    private var saveJob: Job? = null

    init {
        viewModelScope.launch {
            playback.state.collect { ps -> _screen.update { it.copy(ui = ps) } }
        }
        viewModelScope.launch {
            sessionRepository.settings.collect { s ->
                _screen.update { it.copy(settings = s, ayahOffset = s.ayahOffset) }
            }
        }
        playback.onBoundaryExceeded = { forward -> if (forward) nextSurah() else previousSurah() }
    }

    /** Enters the player for a surah; no-op when it is already the loaded surah. */
    fun play(
        reciter: Reciter,
        moshaf: Moshaf,
        surah: QuranSurah,
        availableSurahs: List<QuranSurah>,
        resumeFromSession: Boolean,
    ) {
        val key = "${reciter.id}/${moshaf.id}/${surah.id}"
        _screen.update { it.copy(availableSurahs = availableSurahs) }
        if (loadedKey == key) return
        loadedKey = key
        viewModelScope.launch {
            val timing = loadTiming(moshaf, surah)
            var startPos = 0L
            if (resumeFromSession) {
                val session = sessionRepository.lastSession.first()
                if (session != null &&
                    session.reciterId == reciter.id &&
                    session.moshafId == moshaf.id &&
                    session.surahId == surah.id
                ) {
                    startPos = session.positionMs
                }
            }
            _screen.update {
                it.copy(
                    timingAvailable = timing != null,
                    textLoading = true,
                )
            }
            buildTextItems(surah, timing)
            _screen.update { it.copy(textLoading = false) }
            playback.playSurah(reciter, moshaf, surah, timing, startPositionMs = startPos, autoPlay = true)
            startSessionSaveLoop()
            prefetchNextSurah(surah)
        }
    }

    private suspend fun loadTiming(moshaf: Moshaf, surah: QuranSurah): SurahTiming? {
        val read = timingRepository.readForMoshaf(moshaf.server) ?: return null
        readIdCache = read.id
        val timing = timingRepository.timingFor(read.id, surah.id) ?: return null
        val suggested = BasmalaOffset.suggestOffset(timing.entries.size, surah.versesCount)
        if (suggested != 0) {
            android.util.Log.w("QuranTv", "Surah ${surah.id}: timing entries ${timing.entries.size} vs verses ${surah.versesCount} — non-Hafs offset may be needed")
        }
        return timing
    }

    private suspend fun buildTextItems(surah: QuranSurah, timing: SurahTiming?) {
        val offset = _screen.value.ayahOffset
        val rowCount = timing?.entries?.size ?: (surah.versesCount + 1)
        // Verses only — timing index 0 (the basmala) is rendered as a decorative
        // surah header above the list, never as a numbered row.
        val items = ArrayList<TextItem>((rowCount - 1).coerceAtLeast(0))
        for (i in 1 until rowCount) {
            val key = BasmalaOffset.verseKeyFor(i, surah.id, surah.versesCount, offset)
            val text = key?.let {
                val parts = it.split(':')
                if (parts.size == 2) quranTextRepository.verseText(parts[0].toInt(), parts[1].toInt()) else null
            } ?: ""
            items += TextItem(index = i, verseKey = key, text = text)
        }
        _screen.update { it.copy(textItems = items) }
    }

    private fun prefetchNextSurah(current: QuranSurah) {
        val next = _screen.value.availableSurahs.firstOrNull { it.id > current.id } ?: return
        val readId = readIdCache ?: return
        viewModelScope.launch { timingRepository.timingFor(readId, next.id) }
    }

    // ------------------------------------------------------------------ actions

    fun togglePlayPause() = playback.togglePlayPause()
    fun pause() = playback.pause()
    private var readIdCache: Int? = null

    fun seekToAyah(index: Int) {
        playback.seekToAyah(index)
        if (!playback.state.value.isPlaying) playback.togglePlayPause()
    }

    fun nextAyah() = playback.nextAyah()
    fun previousAyah() = playback.previousAyah()
    fun cycleRepeat() = playback.cycleRepeat()
    fun cycleSpeed() = playback.cycleSpeed()
    fun retry() = playback.retry()

    fun nextSurah() {
        val current = _screen.value.ui.surah ?: return
        val next = _screen.value.availableSurahs.firstOrNull { it.id > current.id } ?: return
        val reciter = _screen.value.ui.reciter ?: return
        val moshaf = _screen.value.ui.moshaf ?: return
        play(reciter, moshaf, next, _screen.value.availableSurahs, resumeFromSession = false)
    }

    fun previousSurah() {
        val current = _screen.value.ui.surah ?: return
        val prev = _screen.value.availableSurahs.lastOrNull { it.id < current.id } ?: return
        val reciter = _screen.value.ui.reciter ?: return
        val moshaf = _screen.value.ui.moshaf ?: return
        play(reciter, moshaf, prev, _screen.value.availableSurahs, resumeFromSession = false)
    }

    fun toggleDisplayMode() {
        val next = if (_screen.value.settings.displayMode == 0) 1 else 0
        viewModelScope.launch { sessionRepository.setDisplayMode(next) }
    }

    // ------------------------------------------------------------------ session persistence

    private fun startSessionSaveLoop() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            while (isActive) {
                val s = _screen.value.ui
                val reciter = s.reciter
                val moshaf = s.moshaf
                val surah = s.surah
                if (reciter != null && moshaf != null && surah != null) {
                    sessionRepository.saveLastSession(
                        reciter = reciter,
                        moshaf = moshaf,
                        surah = surah,
                        ayahIndex = s.currentAyahIndex.coerceAtLeast(0),
                        positionMs = playback.positionMs.value,
                    )
                }
                delay(5_000)
            }
        }
    }
}
