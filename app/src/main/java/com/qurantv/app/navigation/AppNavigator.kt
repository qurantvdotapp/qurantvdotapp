package com.qurantv.app.navigation

import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Destinations. Simple hand-rolled back stack (PROMPT.md Part 11 — pick simple). */
sealed interface Screen {
    data object Home : Screen
    data class SurahGrid(val reciter: Reciter, val moshaf: Moshaf) : Screen
    data class Player(
        val reciter: Reciter,
        val moshaf: Moshaf,
        val surah: QuranSurah,
        val availableSurahs: List<QuranSurah>,
    ) : Screen
    data object Settings : Screen
}

/**
 * Back stack holder. Back hierarchy: Player → Surah list → Home (double-Back on
 * Home exits the app).
 */
class AppNavigator {

    private val _stack = MutableStateFlow(listOf<Screen>(Screen.Home))
    val stack: StateFlow<List<Screen>> = _stack.asStateFlow()

    fun current(): Screen = _stack.value.last()

    fun push(screen: Screen) {
        _stack.value = _stack.value + screen
    }

    fun pop() {
        if (_stack.value.size > 1) {
            _stack.value = _stack.value.dropLast(1)
        }
    }

    /** Used when the user picks another moshaf: replace the surah grid on top. */
    fun replaceTop(screen: Screen) {
        _stack.value = _stack.value.dropLast(1) + screen
    }

    fun popToRoot() {
        _stack.value = listOf(Screen.Home)
    }
}
