package com.qurantv.app.data.repo

import com.qurantv.app.data.api.AyahTimingDto
import com.qurantv.app.data.api.Mp3QuranApi
import com.qurantv.app.data.api.SoarDto
import com.qurantv.app.data.api.TimingReadDto
import com.qurantv.app.data.api.toDomain
import com.qurantv.app.data.cache.JsonDiskCache
import com.qurantv.app.domain.CatalogParsing
import com.qurantv.app.domain.SurahTiming
import com.qurantv.app.domain.TimingAccuracy
import com.qurantv.app.domain.TimingRead
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Per-ayah timing data (PROMPT.md Parts 3.6–3.8):
 *  - the `reads` list is fetched once at startup and cached forever;
 *  - per-(read, surah) timing is immutable → cached forever;
 *  - reads are matched to reciter moshafs by `folder_url` ↔ `server`
 *    (normalized trailing slashes) — timing read ids are NOT reciter ids.
 */
class TimingRepository(
    private val api: Mp3QuranApi,
    private val cache: JsonDiskCache,
    private val json: Json,
) {

    suspend fun reads(): List<TimingRead> {
        val key = "reads"
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.TIMING, key)
            if (cached != null) {
                return@singleFlight json.decodeFromString<List<TimingReadDto>>(cached).map { it.toDomain() }
            }
            val list = api.timingReads().map { it.toDomain() }
            runCatching {
                cache.write(JsonDiskCache.TIMING, key, json.encodeToString(list))
            }
            list
        }
    }

    /** The read whose folder matches this moshaf server, or null when untimed. */
    suspend fun readForMoshaf(server: String): TimingRead? {
        val target = CatalogParsing.normalizeServerUrl(server)
        return reads().firstOrNull { CatalogParsing.normalizeServerUrl(it.folderUrl) == target }
    }

    /** Normalized folder URLs of every read that has ayah timing. */
    suspend fun timedServerUrls(): Set<String> =
        reads().map { CatalogParsing.normalizeServerUrl(it.folderUrl) }.toSet()

    /**
     * The surah ids that have per-ayah timing files for this read (the
     * `ayat_timing/soar` list — some reads cover fewer than all 114 surahs).
     * Immutable → cached forever. Returns null on failure so callers can fall
     * back to showing the full list (graceful degradation).
     */
    suspend fun surahsWithTiming(readId: Int): Set<Int>? {
        val key = "soar_r$readId"
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.TIMING, key)
            if (cached != null) {
                return@singleFlight json.decodeFromString<List<SoarDto>>(cached).map { it.id }.toSet()
            }
            try {
                val list = api.soar(readId)
                runCatching { cache.write(JsonDiskCache.TIMING, key, json.encodeToString(list)) }
                list.map { it.id }.toSet()
            } catch (e: Exception) {
                null // unknown — callers keep the full surah list
            }
        }
    }

    /**
     * Whether the (read, surah) timing is ACTUALLY usable — the soar list can
     * over-claim (e.g. read 122 البنا المجود lists surah 97, but the timing's
     * total is ~6% shorter than the real mp3, so sync is disabled at playback).
     * Verdict: the timing exists AND (when the mp3 is small enough to probe) the
     * mp3 duration matches the timing total within the accuracy tolerance.
     * Cached forever once computed. Returns null when the verdict is unknown
     * (mp3 too large to probe, or the probe failed).
     */
    suspend fun timingUsability(readId: Int, surahId: Int, mp3Url: String): Boolean? {
        val timing = timingFor(readId, surahId) ?: return false
        val verdictKey = "usable2_r${readId}_s$surahId"
        cache.read(JsonDiskCache.TIMING, verdictKey)?.let { return it == "1" }
        val usable = withContext(Dispatchers.IO) {
            probeMp3DurationMs(mp3Url)?.let { mp3Ms ->
                TimingAccuracy.isReliable(mp3Ms, timing.lastEndMs)
            }
        }
        if (usable != null) {
            runCatching { cache.write(JsonDiskCache.TIMING, verdictKey, if (usable) "1" else "0") }
        }
        return usable
    }

    /**
     * Probes an mp3's duration via MediaMetadataRetriever. Only files up to
     * [MAX_PROBE_BYTES] are probed (VBR mp3s without a Xing header require a
     * full scan, so huge surah files would cost too much to check eagerly).
     */
    private fun probeMp3DurationMs(url: String): Long? {
        return try {
            val size = runCatching {
                val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "HEAD"
                conn.setRequestProperty("Range", "bytes=0-0")
                conn.setRequestProperty("User-Agent", "QuranTv/1.0")
                val cl = conn.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
                conn.disconnect()
                cl
            }.getOrNull()
            if (size != null && size > MAX_PROBE_BYTES) return null
            val mmr = android.media.MediaMetadataRetriever()
            try {
                mmr.setDataSource(url)
                mmr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
            } finally {
                runCatching { mmr.release() }
            }
        } catch (e: Exception) {
            null
        }
    }

    private companion object {
        /** Largest mp3 (bytes) we'll eagerly probe for timing accuracy. */
        const val MAX_PROBE_BYTES = 10L * 1024 * 1024
    }

    /** Timing for (read, surah); null on any failure → graceful degradation. */
    suspend fun timingFor(readId: Int, surahId: Int): SurahTiming? {
        val key = "s${surahId}_r$readId"
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.TIMING, key)
            if (cached != null) {
                return@singleFlight json.decodeFromString<List<AyahTimingDto>>(cached).toDomain(readId, surahId)
            }
            try {
                val list = api.ayahTiming(surahId, readId)
                runCatching {
                    cache.write(JsonDiskCache.TIMING, key, json.encodeToString(list))
                }
                list.toDomain(readId, surahId)
            } catch (e: Exception) {
                null // no timing for this pair — play without ayah sync
            }
        }
    }

    /** Warm the cache for the next surah while the current one plays. */
    fun prefetch(readId: Int, surahId: Int, scope: CoroutineScope) {
        scope.launch {
            timingFor(readId, surahId)
        }
    }
}
