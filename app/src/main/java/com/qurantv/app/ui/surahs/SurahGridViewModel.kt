package com.qurantv.app.ui.surahs

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.CatalogRepository
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
)

class SurahGridViewModel(
    private val catalog: CatalogRepository,
    private val timing: TimingRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(SurahGridUiState())
    val ui: StateFlow<SurahGridUiState> = _ui.asStateFlow()

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
            val surahs = all.filter { it.id in availableIds }
            _ui.update { it.copy(surahs = surahs, loading = false, error = false) }
            // Warm the timing cache for the first surah (common next step).
            viewModelScope.launch {
                timing.readForMoshaf(moshaf.server)?.let { read ->
                    surahs.firstOrNull()?.let { s -> timing.timingFor(read.id, s.id) }
                }
            }
        } catch (e: Exception) {
            _ui.update { it.copy(loading = false, error = true) }
        }
    }

    fun togglePicker() = _ui.update { it.copy(pickerOpen = !it.pickerOpen) }

    fun surahFor(id: Int): QuranSurah? = _ui.value.surahs.firstOrNull { it.id == id }
}
