package com.qurantv.app.player

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.common.util.UnstableApi
import android.util.Log
import com.qurantv.app.domain.AyahTiming
import com.qurantv.app.domain.CatalogParsing
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import com.qurantv.app.domain.SurahTiming
import com.qurantv.app.domain.TimingIndex
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

/** Everything the UI needs to render the player. */
data class PlayerUiState(
    val reciter: Reciter? = null,
    val moshaf: Moshaf? = null,
    val surah: QuranSurah? = null,
    val timing: SurahTiming? = null,
    val hasTiming: Boolean = false,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val durationMs: Long = 0,
    val speed: Float = 1f,
    val repeatMode: RepeatMode = RepeatMode.OFF,
    val currentAyahIndex: Int = -1,
    val currentPageUrl: String? = null,
    val error: Boolean = false,
)

/**
 * App-scoped audio engine: Media3 ExoPlayer + MediaSession + audio focus.
 * Owned by the DI container so playback continues while the user browses
 * (PROMPT.md Part 6 — Player back → Surah list keeps playing).
 */
@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackController(
    private val appContext: Context,
    private val okHttpClient: OkHttpClient,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    val player: ExoPlayer = ExoPlayer.Builder(appContext)
        .setLoadControl(
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    1_000_000,
                    5_000_000,
                    1_000_000,
                    1_000_000,
                )
                .build()
        )
        .setMediaSourceFactory(
            DefaultMediaSourceFactory(
                OkHttpDataSource.Factory(okHttpClient)
                    .setUserAgent("QuranTv/1.0 (Android TV)")
            )
        )
        .build()

    private val mediaSession: MediaSession = MediaSession.Builder(appContext, player).build()

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    private val _positionMs = MutableStateFlow(0L)
    val positionMs: StateFlow<Long> = _positionMs.asStateFlow()

    private var timing: SurahTiming? = null
    private var tickerJob: Job? = null
    private var pendingResumePositionMs: Long = 0L
    private var focusRequest: AudioFocusRequest? = null
    private var wasPlayingBeforeFocusLoss = false

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _state.value = _state.value.copy(isPlaying = isPlaying, isBuffering = false)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_BUFFERING -> _state.value = _state.value.copy(isBuffering = true)
                    Player.STATE_READY -> _state.value = _state.value.copy(isBuffering = false)
                    Player.STATE_ENDED -> onPlaybackEnded()
                    else -> Unit
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                _state.value = _state.value.copy(error = true, isBuffering = false, isPlaying = false)
                stopTicker()
            }
        })
    }

    // ------------------------------------------------------------------ control

    fun playSurah(
        reciter: Reciter,
        moshaf: Moshaf,
        surah: QuranSurah,
        timing: SurahTiming?,
        startPositionMs: Long = 0L,
        autoPlay: Boolean = true,
    ) {
        this.timing = timing
        pendingResumePositionMs = startPositionMs.coerceAtLeast(0)
        val url = CatalogParsing.audioUrlFor(moshaf.server, surah.id)
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        player.playbackParameters = androidx.media3.common.PlaybackParameters(_state.value.speed)
        // Ayah repeat is implemented by the position ticker (seek back to the ayah
        // start); ExoPlayer's own repeat modes would loop the whole mp3 file.
        player.repeatMode = if (_state.value.repeatMode == RepeatMode.SURAH) {
            Player.REPEAT_MODE_ALL
        } else {
            Player.REPEAT_MODE_OFF
        }
        if (startPositionMs > 0) player.seekTo(startPositionMs)
        if (autoPlay) {
            requestAudioFocus()
            player.play()
        }
        _state.value = _state.value.copy(
            reciter = reciter,
            moshaf = moshaf,
            surah = surah,
            timing = timing,
            hasTiming = timing != null,
            currentAyahIndex = computeAyahIndex(),
            currentPageUrl = currentPageUrlFor(),
            error = false,
        )
        startTicker()
    }

    fun togglePlayPause() {
        if (player.isPlaying) {
            pause()
        } else {
            if (_state.value.error) return
            // Restart from the beginning when the surah already finished.
            if (player.playbackState == Player.STATE_ENDED) {
                player.seekTo(0)
            }
            requestAudioFocus()
            player.play()
        }
    }

    fun pause() {
        player.pause()
        abandonAudioFocus()
    }

    fun seekTo(positionMs: Long) {
        val target = positionMs.coerceIn(0, player.duration.takeIf { it > 0 } ?: Long.MAX_VALUE)
        player.seekTo(target)
        refreshAfterSeek(target)
    }

    fun seekToAyah(index: Int) {
        val t = timing ?: return
        val entry = t.entryFor(index) ?: return
        seekTo(entry.startMs)
    }

    fun nextAyah() {
        val t = timing
        val current = _state.value.currentAyahIndex
        if (t != null) {
            val entry = t.entryFor(current + 1)
            if (entry != null) {
                seekTo(entry.startMs)
                return
            }
        }
        // No timing / at the last ayah → the caller decides (next surah etc.).
        onBoundaryExceeded(true)
    }

    fun previousAyah() {
        val t = timing
        val current = _state.value.currentAyahIndex
        if (t != null && current > 1) {
            val entry = t.entryFor(current - 1)
            if (entry != null) {
                seekTo(entry.startMs)
                return
            }
        }
        if (t != null && current == 1) {
            seekTo(0L) // back to the basmala/header slot (timing index 0)
            return
        }
        onBoundaryExceeded(false)
    }

    /** Set by the UI layer to handle surah transitions at ayah boundaries. */
    var onBoundaryExceeded: (forward: Boolean) -> Unit = {}

    fun cycleRepeat(): RepeatMode {
        val next = when (_state.value.repeatMode) {
            RepeatMode.OFF -> RepeatMode.AYAH
            RepeatMode.AYAH -> RepeatMode.SURAH
            RepeatMode.SURAH -> RepeatMode.OFF
        }
        player.repeatMode = if (next == RepeatMode.SURAH) {
            Player.REPEAT_MODE_ALL
        } else {
            Player.REPEAT_MODE_OFF
        }
        _state.value = _state.value.copy(repeatMode = next)
        return next
    }

    fun cycleSpeed(): Float {
        val speeds = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)
        val current = _state.value.speed
        val next = speeds[(speeds.indexOf(current) + 1).let { if (it >= speeds.size) 0 else it }]
        player.playbackParameters = androidx.media3.common.PlaybackParameters(next)
        _state.value = _state.value.copy(speed = next)
        return next
    }

    fun setSpeed(speed: Float) {
        player.playbackParameters = androidx.media3.common.PlaybackParameters(speed)
        _state.value = _state.value.copy(speed = speed)
    }

    fun retry() {
        val url = _state.value.moshaf?.let { m ->
            _state.value.surah?.let { s -> CatalogParsing.audioUrlFor(m.server, s.id) }
        } ?: return
        player.setMediaItem(MediaItem.fromUri(url))
        player.prepare()
        requestAudioFocus()
        player.play()
        _state.value = _state.value.copy(error = false)
        startTicker()
    }

    // ------------------------------------------------------------------ ticker

    private fun startTicker() {
        tickerJob?.cancel()
        tickerJob = scope.launch {
            while (isActive) {
                val t = timing
                val pos = player.currentPosition.coerceAtLeast(0)
                _positionMs.value = pos
                val duration = player.duration.takeIf { it > 0 } ?: _state.value.durationMs
                if (duration != _state.value.durationMs) {
                    _state.value = _state.value.copy(durationMs = duration)
                }
                if (t != null) {
                    val idx = TimingIndex.ayahAt(t, pos)
                    updateAyahUiState(idx)
                    // Repeat ayah: at the ayah end, jump back to its start.
                    val s = _state.value
                    if (s.repeatMode == RepeatMode.AYAH) {
                        val entry = t.entryFor(idx)
                        if (entry != null && pos >= effectiveEndMs(t, idx, entry)) {
                            player.seekTo(entry.startMs)
                            refreshAfterSeek(entry.startMs)
                        }
                    }
                }
                delay(100)
            }
        }
    }

    /**
     * Pushes the highlight state for [idx] only when it actually changed — the
     * UI recomposes per change, not per tick (PROMPT Part 6/9).
     */
    private fun updateAyahUiState(idx: Int) {
        val t = timing
        val prev = _state.value.currentAyahIndex
        if (idx != prev) {
            Log.d("QuranTv", "ayah $idx @ ${player.currentPosition}ms")
            _state.value = _state.value.copy(
                currentAyahIndex = idx,
                currentPageUrl = t?.entryFor(idx)?.pageUrl,
            )
        }
    }

    /** Recompute highlight immediately after a seek (don't wait for the ticker). */
    private fun refreshAfterSeek(targetPositionMs: Long) {
        val t = timing ?: return
        updateAyahUiState(TimingIndex.ayahAt(t, targetPositionMs))
    }

    /**
     * The last ayah's end_time can be missing/zero in the data; treat the mp3
     * duration as its end so repeat-ayah still loops on the final verse and the
     * highlight never releases early.
     */
    private fun effectiveEndMs(t: SurahTiming, idx: Int, entry: AyahTiming): Long {
        if (entry.endMs > entry.startMs) return entry.endMs
        if (idx == t.lastAyahIndex) {
            val duration = player.duration.takeIf { it > 0 } ?: return entry.endMs
            if (duration > entry.startMs) return duration
        }
        return entry.endMs
    }

    private fun stopTicker() {
        tickerJob?.cancel()
        tickerJob = null
    }

    private fun onPlaybackEnded() {
        val s = _state.value
        when (s.repeatMode) {
            RepeatMode.SURAH -> {
                player.seekTo(0)
                player.play()
            }
            else -> {
                _state.value = _state.value.copy(isPlaying = false)
                // Auto-advance: when repeat is off and the surah finishes, start the
                // next available surah from its first ayah (no-op when none exists).
                if (s.repeatMode == RepeatMode.OFF) {
                    onBoundaryExceeded(true)
                }
            }
        }
    }

    private fun computeAyahIndex(): Int {
        val t = timing ?: return -1
        return TimingIndex.ayahAt(t, pendingResumePositionMs)
    }

    private fun currentPageUrlFor(): String? {
        val t = timing ?: return null
        val idx = TimingIndex.ayahAt(t, pendingResumePositionMs)
        return t.entryFor(idx)?.pageUrl
    }

    // ------------------------------------------------------------------ audio focus

    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setOnAudioFocusChangeListener { focusChange -> onAudioFocusChange(focusChange) }
                .build()
                .also { focusRequest = it }
            audioManager.requestAudioFocus(request)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                { focusChange -> onAudioFocusChange(focusChange) },
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            )
        }
    }

    private fun abandonAudioFocus() {
        val request = focusRequest
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && request != null) {
            audioManager.abandonAudioFocusRequest(request)
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
    }

    private fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                wasPlayingBeforeFocusLoss = player.isPlaying
                pause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                wasPlayingBeforeFocusLoss = player.isPlaying
                pause()
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (wasPlayingBeforeFocusLoss) player.play()
                wasPlayingBeforeFocusLoss = false
            }
        }
    }

    fun release() {
        stopTicker()
        pause()
        player.release()
        mediaSession.release()
    }
}
