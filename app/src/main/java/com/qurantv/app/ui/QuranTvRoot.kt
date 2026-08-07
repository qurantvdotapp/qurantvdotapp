package com.qurantv.app.ui

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.qurantv.app.LocaleManager
import com.qurantv.app.di.AppContainer
import com.qurantv.app.navigation.Screen
import com.qurantv.app.ui.home.HomeScreen
import com.qurantv.app.ui.home.SearchOverlay
import com.qurantv.app.ui.player.PlayerScreen
import com.qurantv.app.ui.settings.SettingsScreen
import com.qurantv.app.ui.surahs.SurahGridScreen
import com.qurantv.app.ui.theme.QuranTvTheme

/**
 * App shell: locale/layout direction, theme, back stack and back-key handling.
 * Back hierarchy: Player → Surah list → Home; double-Back on Home exits.
 */
@Composable
fun QuranTvRoot(
    container: AppContainer,
    onExit: () -> Unit,
    onRecreateForLanguage: () -> Unit,
) {
    val settings by container.settingsViewModel.settings.collectAsState()
    val language = settings.language
    val direction = if (language == "ar") LayoutDirection.Rtl else LayoutDirection.Ltr

    CompositionLocalProvider(LocalLayoutDirection provides direction) {
        QuranTvTheme {
            val navigator = container.navigator
            val stack by navigator.stack.collectAsState()
            val screen = stack.lastOrNull() ?: Screen.Home
            var lastBack by remember { mutableLongStateOf(0L) }
            val context = LocalContext.current

            BackHandler {
                if (stack.size > 1) {
                    navigator.pop()
                } else {
                    val now = SystemClock.elapsedRealtime()
                    if (now - lastBack < 2_000) {
                        onExit()
                    } else {
                        lastBack = now
                    }
                }
            }

            when (screen) {
                is Screen.Home -> HomeScreen(
                    container = container,
                    onOpenSettings = { navigator.push(Screen.Settings) },
                    onOpenSearch = { container.homeViewModel.openSearch() },
                )
                is Screen.SurahGrid -> SurahGridScreen(
                    container = container,
                    screen = screen,
                    onBack = { navigator.pop() },
                )
                is Screen.Player -> PlayerScreen(
                    container = container,
                    screen = screen,
                    onBack = { navigator.pop() },
                )
                is Screen.Settings -> SettingsScreen(
                    container = container,
                    onBack = { navigator.pop() },
                    onLanguageChange = { lang ->
                        LocaleManager.writeLanguage(context, lang)
                        onRecreateForLanguage()
                    },
                )
            }

            val homeUi by container.homeViewModel.ui.collectAsState()
            if (homeUi.searchOpen) {
                SearchOverlay(container = container, onClose = { container.homeViewModel.closeSearch() })
            }
        }
    }
}
