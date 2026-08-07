package com.qurantv.app.data.api

import kotlinx.serialization.json.Json

/** Quran.com API v4 (same Tanzil-sourced text; enrichment/fallback for D2). */
class QuranComApi(
    private val client: ApiClient,
    private val json: Json,
) {
    private val base = "https://api.quran.com/api/v4"

    suspend fun chapters(language: String): List<ChapterDto> =
        json.decodeFromString<ChaptersResponse>(client.getText("$base/chapters?language=$language")).chapters

    suspend fun versesUthmani(chapter: Int): List<VerseDto> =
        json.decodeFromString<VersesResponse>(client.getText("$base/quran/verses/uthmani?chapter_number=$chapter")).verses
}
