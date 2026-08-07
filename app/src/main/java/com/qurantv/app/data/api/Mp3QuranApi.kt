package com.qurantv.app.data.api

import com.qurantv.app.domain.AyahTiming
import com.qurantv.app.domain.CatalogParsing
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.PointF
import com.qurantv.app.domain.Reciter
import com.qurantv.app.domain.SurahTiming
import com.qurantv.app.domain.TimingRead
import kotlinx.serialization.json.Json

/**
 * mp3quran.net API v3 client (endpoints verified live, PROMPT.md Part 3).
 * Always https; the server 301-redirects plain http and OkHttp follows redirects
 * by default (do not disable).
 */
class Mp3QuranApi(
    private val client: ApiClient,
    private val json: Json,
) {
    private val base = "https://mp3quran.net/api/v3"

    suspend fun suwar(language: String): List<SurahDto> =
        json.decodeFromString<SuwarResponse>(client.getText("$base/suwar?language=$language")).suwar

    suspend fun reciters(language: String): List<ReciterDto> =
        json.decodeFromString<RecitersResponse>(client.getText("$base/reciters?language=$language")).reciters

    suspend fun recentReads(): List<ReciterDto> =
        json.decodeFromString<RecentReadsResponse>(client.getText("$base/recent_reads")).reads

    suspend fun timingReads(): List<TimingReadDto> =
        json.decodeFromString(client.getText("$base/ayat_timing/reads"))

    suspend fun soar(readId: Int): List<SoarDto> =
        json.decodeFromString(client.getText("$base/ayat_timing/soar?read=$readId"))

    suspend fun ayahTiming(surah: Int, readId: Int): List<AyahTimingDto> =
        json.decodeFromString(client.getText("$base/ayat_timing?surah=$surah&read=$readId"))
}

/* ---------------- DTO → domain mapping (defensive) ---------------- */

fun ReciterDto.toDomain(): Reciter =
    Reciter(
        id = id,
        name = name,
        letter = letter,
        moshafs = moshaf.map { it.toDomain() },
    )

fun MoshafDto.toDomain(): Moshaf =
    Moshaf(
        id = id,
        name = name,
        server = server,
        surahTotal = surahTotal,
        moshafType = moshafType,
        rewayaId = rewayaId,
        surahList = CatalogParsing.parseSurahList(surahList),
    )

fun TimingReadDto.toDomain(): TimingRead =
    TimingRead(
        id = id,
        name = name,
        rewaya = rewaya,
        folderUrl = folderUrl,
    )

fun List<AyahTimingDto>.toDomain(readId: Int, surahId: Int): SurahTiming {
    val entries = this
        .map { dto ->
            AyahTiming(
                ayah = dto.ayah,
                startMs = dto.startTime.coerceAtLeast(0),
                endMs = dto.endTime.coerceAtLeast(dto.startTime),
                polygon = CatalogParsing.parsePolygon(dto.polygon),
                x = dto.x?.trim()?.toFloatOrNull(),
                y = dto.y?.trim()?.toFloatOrNull(),
                pageUrl = dto.page,
            )
        }
        .sortedBy { it.ayah }
    return SurahTiming(readId = readId, surahId = surahId, entries = entries)
}
