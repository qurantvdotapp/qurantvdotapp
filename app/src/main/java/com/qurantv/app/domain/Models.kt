package com.qurantv.app.domain

/** A reciter from the mp3quran catalog (may have several moshafs / riwayat). */
data class Reciter(
    val id: Int,
    val name: String,
    val letter: String?,
    val moshafs: List<Moshaf>,
)

/** One moshaf (riwaya + recitation style) of a reciter. */
data class Moshaf(
    val id: Int,
    val name: String,
    val server: String,
    val surahTotal: Int?,
    val moshafType: Int?,
    val rewayaId: Int?,
    val surahList: List<Int>,
) {
    /** Available surah ids; when the API omits the list, assume the full mushaf. */
    val availableSurahIds: List<Int>
        get() = if (surahList.isEmpty()) (1..114).toList() else surahList
}

/** A surah with Arabic + English names and Madinah mushaf page range. */
data class QuranSurah(
    val id: Int,
    val nameAr: String,
    val nameEn: String?,
    val versesCount: Int,
    val startPage: Int,
    val endPage: Int,
    val isMakki: Boolean,
)

/** A read from the mp3quran ayat_timing/reads list (per-ayah timing provider). */
data class TimingRead(
    val id: Int,
    val name: String,
    val rewaya: String?,
    val folderUrl: String,
)

/** A point in the SVG mushaf page coordinate space. */
data class PointF(val x: Float, val y: Float)

/** Timing of one ayah: the audio span plus the highlight geometry on its page. */
data class AyahTiming(
    val ayah: Int,
    val startMs: Long,
    val endMs: Long,
    val polygon: List<PointF>?,
    val x: Float?,
    val y: Float?,
    val pageUrl: String?,
)

/** The full sorted ayah timing list for one (read, surah) pair. */
data class SurahTiming(
    val readId: Int,
    val surahId: Int,
    val entries: List<AyahTiming>,
) {
    private val byAyah: Map<Int, AyahTiming> = entries.associateBy { it.ayah }

    val lastEndMs: Long get() = entries.lastOrNull()?.endMs ?: 0L

    /** The timing index of the last entry (e.g. 286 for surah 2). */
    val lastAyahIndex: Int get() = entries.lastOrNull()?.ayah ?: -1

    /**
     * The entry for a timing ayah index, or null when it has none.
     *
     * Some reads include the basmala as timing index 0 (entry with `ayah == 0`);
     * others omit it entirely (entries start at 1) — index 0 is then a virtual
     * basmala slot covering the audio before the first entry. Always look up by
     * timing index, never by list position.
     */
    fun entryFor(ayah: Int): AyahTiming? = byAyah[ayah]
}

/**
 * One horizontal highlight band on a mushaf page, in the page's viewBox
 * coordinate space (or, for KSU raster pages, fractions of the image height).
 * Used by the offline text-length estimate and KSU fallback paths.
 */
data class PageAyahBand(val yTop: Float, val yBottom: Float)
