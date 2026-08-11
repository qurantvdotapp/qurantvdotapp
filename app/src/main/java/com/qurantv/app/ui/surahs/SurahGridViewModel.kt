package com.qurantv.app.ui.surahs

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.CatalogRepository
import com.qurantv.app.data.repo.SessionRepository
import com.qurantv.app.data.repo.TimingRepository
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SurahGridUiState(
    val reciter: Reciter? = null,
    val moshaf: Moshaf? = null,
    val moshafIndex: Int = 0,
    val surahs: List<QuranSurah> = emptyList(),
    val loading: Boolean = true,
    val error: Boolean = false,
    val pickerOpen: Boolean = false,
    // "only reciters with ayah timing" setting — when ON the grid lists only
    // the surahs that have per-ayah timing files for the selected read.
    val onlyTimed: Boolean = false,
    // Normalized folder URLs of every read with ayah timing.
    val timedServerUrls: Set<String> = emptySet(),
    // Surahs of the current moshaf WITHOUT timing for the matched read.
    val untimedSurahIds: Set<Int> = emptySet(),
)

class SurahGridViewModel(
    private val catalog: CatalogRepository,
    private val timing: TimingRepository,
    private val sessions: SessionRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(SurahGridUiState())
    val ui: StateFlow<SurahGridUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            sessions.settings.collect { settings ->
                val changed = _ui.value.onlyTimed != settings.onlyTimedReciters
                _ui.update { it.copy(onlyTimed = settings.onlyTimedReciters) }
                // Re-apply the surah filter whenever the setting changes.
                if (changed) {
                    _ui.value.reciter?.let { r ->
                        _ui.value.moshaf?.let { m -> loadSurahs(r, m) }
                    }
                }
            }
        }
    }

    fun open(reciter: Reciter, moshaf: Moshaf) {
        if (_ui.value.reciter?.id == reciter.id && _ui.value.moshaf?.id == moshaf.id) return
        val index = reciter.moshafs.indexOfFirst { it.id == moshaf.id }.coerceAtLeast(0)
        _ui.update { it.copy(reciter = reciter, moshaf = moshaf, moshafIndex = index, loading = true, error = false) }
        viewModelScope.launch {
            loadSurahs(reciter, moshaf)
        }
    }

    fun selectMoshaf(index: Int) {
        val reciter = _ui.value.reciter ?: return
        val moshaf = reciter.moshafs.getOrNull(index) ?: return
        _ui.update { it.copy(moshaf = moshaf, moshafIndex = index, loading = true, error = false) }
        viewModelScope.launch {
            loadSurahs(reciter, moshaf)
        }
    }

    private suspend fun loadSurahs(reciter: Reciter, moshaf: Moshaf) {
        try {
            val all = catalog.surahs("ar").first()
            val availableIds = moshaf.availableSurahIds.toSet()
            var surahs = all.filter { it.id in availableIds }
            // "Only reciters with ayah timing": intersect with the read's timed
            // surah list (unknown timing → keep the full list, graceful).
            var timedServers = _ui.value.timedServerUrls
            var untimed = emptySet<Int>()
            val read = timing.readForMoshaf(moshaf.server)
            if (read != null) {
                val timed = timing.surahsWithTiming(read.id)
                if (timed != null) {
                    if (_ui.value.onlyTimed) surahs = surahs.filter { it.id in timed }
                    untimed = availableIds - timed
                }
            } else {
                // No timing read at all → every surah is untimed.
                untimed = availableIds
            }
            if (timedServers.isEmpty()) {
                timedServers = timing.timedServerUrls()
            }
            _ui.update {
                it.copy(
                    surahs = surahs,
                    loading = false,
                    error = false,
                    timedServerUrls = timedServers,
                    untimedSurahIds = untimed,
                )
            }
            // Warm the timing cache for the first surah (common next step).
            viewModelScope.launch {
                timing.readForMoshaf(moshaf.server)?.let { r ->
                    surahs.firstOrNull()?.let { s -> timing.timingFor(r.id, s.id) }
                }
            }
        } catch (e: Exception) {
            _ui.update { it.copy(loading = false, error = true) }
        }
    }

    fun togglePicker() = _ui.update { it.copy(pickerOpen = !it.pickerOpen) }

    fun surahFor(id: Int): QuranSurah? = _ui.value.surahs.firstOrNull { it.id == id }
}
