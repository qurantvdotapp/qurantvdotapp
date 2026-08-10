package com.qurantv.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.CatalogRepository
import com.qurantv.app.data.repo.LastSession
import com.qurantv.app.data.repo.SessionRepository
import com.qurantv.app.data.repo.TimingRepository
import com.qurantv.app.domain.CatalogParsing
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
    val onlyTimed: Boolean = false, // "only reciters with ayah timing" setting
    val searchOpen: Boolean = false,
    val searchQuery: String = "",
    val selectedLetter: String? = null,
    // Reciter waiting for the pre-grid mushaf chooser (reciters with >1 moshaf).
    val pendingMoshafReciterId: Int? = null,
)

class HomeViewModel(
    private val catalog: CatalogRepository,
    private val sessions: SessionRepository,
    private val timing: TimingRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    private val arabicCollator = java.text.Collator.getInstance(java.util.Locale("ar"))

    /** Normalized folder URLs of every read that has ayah timing (server match). */
    private var timedServerUrls: Set<String> = emptySet()
    private var allReciters: List<Reciter> = emptyList()
    private var allRecentReads: List<Reciter> = emptyList()

    init {
        viewModelScope.launch {
            sessions.lastSession.collect { session ->
                _ui.update { it.copy(lastSession = session) }
            }
        }
        viewModelScope.launch {
            sessions.settings.collect { settings ->
                // Re-apply the "only timed" filter whenever the setting changes.
                _ui.update { it.copy(onlyTimed = settings.onlyTimedReciters) }
                applyFilter()
            }
        }
        viewModelScope.launch {
            loadCatalog()
        }
    }

    private suspend fun loadCatalog() {
        _ui.update { it.copy(recitersLoading = true, recitersError = false) }
        try {
            // The reads list (cached forever) tells us which moshaf servers have
            // ayah timing — matched by normalized folder_url ↔ server.
            val reads = timing.reads()
            timedServerUrls = reads.map { CatalogParsing.normalizeServerUrl(it.folderUrl) }.toSet()
            allReciters = catalog.reciters("ar").first()
            applyFilter()
        } catch (e: Exception) {
            android.util.Log.e("QuranTv", "catalog load failed", e)
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
            allRecentReads = catalog.recentReads().first()
            _ui.update { it.copy(recentReads = filtered(allRecentReads), recentReadsError = false) }
        } catch (e: Exception) {
            _ui.update { it.copy(recentReadsError = true) }
        }
    }

    private fun isMoshafTimed(moshaf: Moshaf): Boolean =
        CatalogParsing.normalizeServerUrl(moshaf.server) in timedServerUrls

    /** Filters a reciter list to those with at least one timed moshaf (when the
     *  setting is on), keeping only the timed moshafs. */
    private fun filtered(reciters: List<Reciter>): List<Reciter> {
        if (!_ui.value.onlyTimed || timedServerUrls.isEmpty()) return reciters
        return reciters.map { r ->
            r.copy(moshafs = r.moshafs.filter { isMoshafTimed(it) })
        }.filter { it.moshafs.isNotEmpty() }
    }

    private fun applyFilter() {
        val shown = filtered(allReciters)
        // Sort each letter group alphabetically (Arabic collation).
        val grouped = shown.groupBy { it.letter ?: "?" }
            .mapValues { (_, list) -> list.sortedWith(Comparator { a, b -> arabicCollator.compare(a.name, b.name) }) }
        _ui.update {
            it.copy(
                reciters = shown,
                recitersLoading = false,
                recitersError = false,
                recitersByLetter = grouped,
                letters = grouped.keys.sorted(),
                selectedLetter = it.selectedLetter?.takeIf { l -> l in grouped } ?: grouped.keys.sorted().firstOrNull(),
            )
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

    /**
     * Registers a reciter for the pre-grid mushaf chooser. Returns true when the
     * chooser must open (reciter has several moshafs); false when the caller may
     * navigate straight to the surah grid (single moshaf — first one is implied).
     */
    fun requestMoshafSelection(reciter: Reciter): Boolean {
        if (reciter.moshafs.size > 1) {
            _ui.update { it.copy(pendingMoshafReciterId = reciter.id) }
            return true
        }
        return false
    }

    fun dismissMoshafSelection() = _ui.update { it.copy(pendingMoshafReciterId = null) }

    /** Resolves the saved session against the (filtered) catalog for the Continue card. */
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
