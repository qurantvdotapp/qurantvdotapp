package com.qurantv.app.data.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/* ---------------- mp3quran.net/api/v3 DTOs (shapes verified live) ---------------- */

@Serializable
data class SuwarResponse(val suwar: List<SurahDto>)

@Serializable
data class SurahDto(
    val id: Int,
    val name: String,
    @SerialName("start_page") val startPage: Int = 0,
    @SerialName("end_page") val endPage: Int = 0,
    val makkia: Int? = null,
    val type: Int? = null,
)

@Serializable
data class RecitersResponse(val reciters: List<ReciterDto>)

@Serializable
data class RecentReadsResponse(val reads: List<ReciterDto>)

@Serializable
data class ReciterDto(
    val id: Int,
    val name: String,
    val letter: String? = null,
    val date: String? = null,
    val moshaf: List<MoshafDto> = emptyList(),
)

@Serializable
data class MoshafDto(
    val id: Int,
    val name: String,
    val server: String,
    @SerialName("surah_total") val surahTotal: Int? = null,
    @SerialName("moshaf_type") val moshafType: Int? = null,
    @SerialName("rewaya_id") val rewayaId: Int? = null,
    @SerialName("surah_list") val surahList: String? = null,
)

@Serializable
data class TimingReadDto(
    val id: Int,
    val name: String,
    val rewaya: String? = null,
    @SerialName("folder_url") val folderUrl: String = "",
    @SerialName("soar_count") val soarCount: Int? = null,
    @SerialName("soar_link") val soarLink: String? = null,
)

@Serializable
data class SoarDto(
    val id: Int,
    val name: String,
    @SerialName("timing_link") val timingLink: String? = null,
)

@Serializable
data class AyahTimingDto(
    val ayah: Int,
    val polygon: String? = null,
    @SerialName("start_time") val startTime: Long = 0,
    @SerialName("end_time") val endTime: Long = 0,
    val x: String? = null,
    val y: String? = null,
    val page: String? = null,
)

/* ---------------- Quran.com API v4 DTOs (same Tanzil-sourced text) ---------------- */

@Serializable
data class ChaptersResponse(val chapters: List<ChapterDto>)

@Serializable
data class ChapterDto(
    val id: Int,
    @SerialName("name_arabic") val nameArabic: String,
    @SerialName("name_simple") val nameSimple: String,
    @SerialName("verses_count") val versesCount: Int,
)

@Serializable
data class VersesResponse(val verses: List<VerseDto>)

@Serializable
data class VerseDto(
    val id: Long,
    @SerialName("verse_key") val verseKey: String,
    @SerialName("text_uthmani") val textUthmani: String,
    @SerialName("chapter_id") val chapterId: Int,
    @SerialName("verse_number") val verseNumber: Int,
)
