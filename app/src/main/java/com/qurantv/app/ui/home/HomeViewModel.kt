package com.qurantv.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.CatalogRepository
import com.qurantv.app.data.repo.LastSession
import com.qurantv.app.data.repo.SessionRepository
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val reciters: List<Reciter> = emptyList(),
    val recitersLoading: Boolean = true,
    val recitersError: Boolean = false,
    val surahs: List<QuranSurah> = emptyList(),
    val letters: List<String> = emptyList(),
    val recitersByLetter: Map<String, List<Reciter>> = emptyMap(),
    val recentReads: List<Reciter> = emptyList(),
    val recentReadsError: Boolean = false,
    val lastSession: LastSession? = null,
    val searchOpen: Boolean = false,
    val searchQuery: String = "",
    val selectedLetter: String? = null,
)

class HomeViewModel(
    private val catalog: CatalogRepository,
    private val sessions: SessionRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            sessions.lastSession.collect { session ->
                _ui.update { it.copy(lastSession = session) }
            }
        }
        viewModelScope.launch {
            loadCatalog()
        }
    }

    private suspend fun loadCatalog() {
        _ui.update { it.copy(recitersLoading = true, recitersError = false) }
        try {
            val reciters = catalog.reciters("ar").first()
            val grouped = reciters.groupBy { it.letter ?: "?" }
            _ui.update {
                it.copy(
                    reciters = reciters,
                    recitersLoading = false,
                    recitersError = false,
                    recitersByLetter = grouped,
                    letters = grouped.keys.sorted(),
                    selectedLetter = it.selectedLetter ?: grouped.keys.sorted().firstOrNull(),
                )
            }
        } catch (e: Exception) {
            _ui.update { it.copy(recitersLoading = false, recitersError = true) }
        }
        // Surah names (Arabic + English) — cached on disk, used by Continue + grid.
        try {
            val surahs = catalog.surahs("ar").first()
            _ui.update { it.copy(surahs = surahs) }
        } catch (e: Exception) {
            // Non-fatal: surah names resolve again when the grid screen loads.
        }
        // Recent reads is a soft-fail row.
        try {
            val recent = catalog.recentReads().first()
            _ui.update { it.copy(recentReads = recent, recentReadsError = false) }
        } catch (e: Exception) {
            _ui.update { it.copy(recentReadsError = true) }
        }
    }

    fun retry() {
        viewModelScope.launch { loadCatalog() }
    }

    fun selectLetter(letter: String) {
        _ui.update { it.copy(selectedLetter = letter) }
    }

    fun openSearch() = _ui.update { it.copy(searchOpen = true) }
    fun closeSearch() = _ui.update { it.copy(searchOpen = false) }
    fun setSearchQuery(q: String) = _ui.update { it.copy(searchQuery = q) }

    fun searchResults(): List<Reciter> {
        val q = _ui.value.searchQuery.trim()
        if (q.isEmpty()) return emptyList()
        return _ui.value.reciters.filter {
            it.name.contains(q, ignoreCase = true) || it.letter?.equals(q, ignoreCase = true) == true
        }
    }

    /** Resolves the saved session against the loaded catalog for the Continue card. */
    fun continueTarget(): Triple<Reciter, Moshaf, LastSession>? {
        val session = _ui.value.lastSession ?: return null
        val reciter = _ui.value.reciters.firstOrNull { it.id == session.reciterId } ?: return null
        val moshaf = reciter.moshafs.firstOrNull { it.id == session.moshafId }
            ?: reciter.moshafs.firstOrNull() ?: return null
        return Triple(reciter, moshaf, session)
    }

    /** Surahs available for a moshaf (used by the Continue card). */
    fun surahsFor(moshaf: Moshaf): List<QuranSurah> {
        val ids = moshaf.availableSurahIds.toSet()
        return _ui.value.surahs.filter { it.id in ids }
    }
}
