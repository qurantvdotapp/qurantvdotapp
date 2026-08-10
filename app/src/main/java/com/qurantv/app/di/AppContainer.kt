package com.qurantv.app.di

import android.content.Context
import com.qurantv.app.data.api.ApiClient
import com.qurantv.app.data.api.Mp3QuranApi
import com.qurantv.app.data.api.QuranComApi
import com.qurantv.app.data.cache.JsonDiskCache
import com.qurantv.app.data.repo.CatalogRepository
import com.qurantv.app.data.repo.QuranTextRepository
import com.qurantv.app.data.repo.SessionRepository
import com.qurantv.app.data.repo.TimingRepository
import com.qurantv.app.data.repo.KsuHilitesRepository
import com.qurantv.app.navigation.AppNavigator
import com.qurantv.app.player.PlaybackController
import com.qurantv.app.ui.player.AyahImageLoader
import com.qurantv.app.ui.player.IslamicNetworkPageLoader
import com.qurantv.app.ui.player.KsuPageLoader
import com.qurantv.app.ui.player.PageImageLoader
import com.qurantv.app.ui.home.HomeViewModel
import com.qurantv.app.ui.player.PlayerViewModel
import com.qurantv.app.ui.settings.SettingsViewModel
import com.qurantv.app.ui.surahs.SurahGridViewModel
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient

/**
 * Manual constructor DI (PROMPT.md Part 2 — keep it simple). All singletons are
 * created once in [com.qurantv.app.QuranTvApp] and shared across screens.
 */
class AppContainer(context: Context) {

    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .retryOnConnectionFailure(true)
        .build()

    private val apiClient = ApiClient(okHttpClient)
    private val mp3QuranApi = Mp3QuranApi(apiClient, json)
    private val quranComApi = QuranComApi(apiClient, json)

    val cache = JsonDiskCache(context)
    val catalogRepository = CatalogRepository(mp3QuranApi, quranComApi, cache, json)
    val timingRepository = TimingRepository(mp3QuranApi, cache, json)
    val quranTextRepository = QuranTextRepository(context, quranComApi, cache, json)
    val sessionRepository = SessionRepository(context)
    val ksuHilitesRepository = KsuHilitesRepository(apiClient, cache, json)

    val playbackController = PlaybackController(context.applicationContext, okHttpClient)
    val pageImageLoader = PageImageLoader(okHttpClient)
    val ayahImageLoader = AyahImageLoader(okHttpClient)
    val islamicNetworkPageLoader = IslamicNetworkPageLoader(okHttpClient)
    val ksuPageLoader = KsuPageLoader(okHttpClient)
    val navigator = AppNavigator()

    val homeViewModel by lazy { HomeViewModel(catalogRepository, sessionRepository, timingRepository) }
    val surahGridViewModel by lazy { SurahGridViewModel(catalogRepository, timingRepository, sessionRepository) }
    val playerViewModel by lazy {
        PlayerViewModel(
            playback = playbackController,
            timingRepository = timingRepository,
            quranTextRepository = quranTextRepository,
            sessionRepository = sessionRepository,
        )
    }
    val settingsViewModel by lazy { SettingsViewModel(sessionRepository) }
}
