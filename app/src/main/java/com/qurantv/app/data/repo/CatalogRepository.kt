package com.qurantv.app.data.repo

import com.qurantv.app.data.api.ChapterDto
import com.qurantv.app.data.api.ChaptersResponse
import com.qurantv.app.data.api.Mp3QuranApi
import com.qurantv.app.data.api.QuranComApi
import com.qurantv.app.data.api.RecitersResponse
import com.qurantv.app.data.api.SuwarResponse
import com.qurantv.app.data.api.toDomain
import com.qurantv.app.data.cache.JsonDiskCache
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json

/**
 * Catalog data (reciters, surahs, English names). Cached on disk with a 24h TTL
 * so browsing works offline (PROMPT.md Part 1.8 / Part 8).
 */
class CatalogRepository(
    private val api: Mp3QuranApi,
    private val quranApi: QuranComApi,
    private val cache: JsonDiskCache,
    private val json: Json,
) {

    /** All surahs with Arabic (mp3quran) and English (Quran.com) names, merged by id. */
    fun surahs(language: String): Flow<List<QuranSurah>> = flow {
        emit(loadSurahs(language))
    }

    private suspend fun loadSurahs(language: String): List<QuranSurah> {
        val key = "suwar_$language"
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.CATALOG, key, JsonDiskCache.TTL_24H)
            val suwar = if (cached != null) {
                json.decodeFromString<SuwarResponse>(cached).suwar
            } else {
                api.suwar(language).also { list ->
                    runCatching {
                        cache.write(JsonDiskCache.CATALOG, key, json.encodeToString(SuwarResponse(list)))
                    }
                }
            }
            val chapters = loadChapters("en")
            val byId = chapters.associateBy { it.id }
            suwar.map { s ->
                val ch = byId[s.id]
                QuranSurah(
                    id = s.id,
                    nameAr = s.name,
                    nameEn = ch?.nameSimple,
                    versesCount = ch?.versesCount ?: 0,
                    startPage = s.startPage,
                    endPage = s.endPage,
                    isMakki = s.makkia == 1,
                )
            }
        }
    }

    private suspend fun loadChapters(language: String): List<ChapterDto> {
        val key = "chapters_$language"
        val cached = cache.read(JsonDiskCache.CATALOG, key, JsonDiskCache.TTL_24H)
        if (cached != null) {
            return json.decodeFromString<ChaptersResponse>(cached).chapters
        }
        return try {
            quranApi.chapters(language).also { list ->
                runCatching {
                    cache.write(JsonDiskCache.CATALOG, key, json.encodeToString(ChaptersResponse(list)))
                }
            }
        } catch (e: Exception) {
            emptyList() // English names are enrichment only; never block the catalog
        }
    }

    /** Reciters, grouped by the API `letter` field (A–Z jump rail). */
    fun reciters(language: String): Flow<List<Reciter>> = flow {
        emit(loadReciters(language))
    }

    private suspend fun loadReciters(language: String): List<Reciter> {
        val key = "reciters_$language"
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.CATALOG, key, JsonDiskCache.TTL_24H)
            val dtos = if (cached != null) {
                json.decodeFromString<RecitersResponse>(cached).reciters
            } else {
                api.reciters(language).also { list ->
                    runCatching {
                        cache.write(JsonDiskCache.CATALOG, key, json.encodeToString(RecitersResponse(list)))
                    }
                }
            }
            dtos.map { it.toDomain() }
        }
    }

    /** Recently added reads row on Home (optional per PROMPT Part 1). */
    fun recentReads(): Flow<List<Reciter>> = flow {
        val cached = cache.read(JsonDiskCache.CATALOG, "recent_reads", JsonDiskCache.TTL_24H)
        val dtos = if (cached != null) {
            json.decodeFromString<com.qurantv.app.data.api.RecentReadsResponse>(cached).reads
        } else {
            api.recentReads().also { list ->
                runCatching {
                    cache.write(
                        JsonDiskCache.CATALOG,
                        "recent_reads",
                        json.encodeToString(com.qurantv.app.data.api.RecentReadsResponse(list))
                    )
                }
            }
        }
        emit(dtos.map { it.toDomain() })
    }
}
