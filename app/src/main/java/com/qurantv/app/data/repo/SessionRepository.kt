package com.qurantv.app.data.repo

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.qurantv.app.domain.Moshaf
import com.qurantv.app.domain.QuranSurah
import com.qurantv.app.domain.Reciter
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "qurantv")

data class AppSettings(
    val language: String = "ar", // "ar" | "en" (Arabic primary, D3)
    val defaultSpeed: Float = 1f,
    val fontSizeIndex: Int = 1, // 0 = small, 1 = normal, 2 = large
    val highlightColorIndex: Int = 0, // 0 = gold, 1 = green, 2 = cyan
    val displayMode: Int = 0, // 0 = text mode, 1 = mushaf page mode
    val mushafStyle: Int = 0, // page mode style: 0 = Madinah (SVG), 1 = Tajweed (per-ayah color images)
    val ayahOffset: Int = 0, // basmala offset for non-Hafs riwayat (best effort)
)

data class LastSession(
    val reciterId: Int,
    val reciterName: String,
    val moshafId: Int,
    val moshafName: String,
    val surahId: Int,
    val surahNameAr: String,
    val ayahIndex: Int,
    val positionMs: Long,
    val updatedAt: Long,
)

/**
 * DataStore-backed persistence for settings + "continue listening" session
 * (PROMPT.md Part 1.6 / 1.7, Part 8). Position writes are throttled by the
 * caller (PlayerViewModel writes at most every ~5 s, not per tick).
 */
class SessionRepository(private val context: Context) {

    private object Keys {
        val language = stringPreferencesKey("language")
        val defaultSpeed = floatPreferencesKey("default_speed")
        val fontSize = intPreferencesKey("font_size")
        val highlightColor = intPreferencesKey("highlight_color")
        val displayMode = intPreferencesKey("display_mode")
        val mushafStyle = intPreferencesKey("mushaf_style")
        val ayahOffset = intPreferencesKey("ayah_offset")

        val sReciterId = intPreferencesKey("s_reciter_id")
        val sReciterName = stringPreferencesKey("s_reciter_name")
        val sMoshafId = intPreferencesKey("s_moshaf_id")
        val sMoshafName = stringPreferencesKey("s_moshaf_name")
        val sSurahId = intPreferencesKey("s_surah_id")
        val sSurahName = stringPreferencesKey("s_surah_name")
        val sAyah = intPreferencesKey("s_ayah")
        val sPosition = longPreferencesKey("s_position")
        val sUpdated = longPreferencesKey("s_updated")
    }

    val settings: Flow<AppSettings> = context.dataStore.data.map { p ->
        AppSettings(
            language = p[Keys.language] ?: "ar",
            defaultSpeed = p[Keys.defaultSpeed] ?: 1f,
            fontSizeIndex = p[Keys.fontSize] ?: 1,
            highlightColorIndex = p[Keys.highlightColor] ?: 0,
            displayMode = p[Keys.displayMode] ?: 0,
            mushafStyle = p[Keys.mushafStyle] ?: 0,
            ayahOffset = p[Keys.ayahOffset] ?: 0,
        )
    }

    val lastSession: Flow<LastSession?> = context.dataStore.data.map { p ->
        val id = p[Keys.sReciterId] ?: return@map null
        LastSession(
            reciterId = id,
            reciterName = p[Keys.sReciterName] ?: "",
            moshafId = p[Keys.sMoshafId] ?: 0,
            moshafName = p[Keys.sMoshafName] ?: "",
            surahId = p[Keys.sSurahId] ?: 1,
            surahNameAr = p[Keys.sSurahName] ?: "",
            ayahIndex = p[Keys.sAyah] ?: 0,
            positionMs = p[Keys.sPosition] ?: 0L,
            updatedAt = p[Keys.sUpdated] ?: 0L,
        )
    }

    suspend fun setLanguage(language: String) = context.dataStore.edit { it[Keys.language] = language }
    suspend fun setDefaultSpeed(speed: Float) = context.dataStore.edit { it[Keys.defaultSpeed] = speed }
    suspend fun setFontSize(index: Int) = context.dataStore.edit { it[Keys.fontSize] = index }
    suspend fun setHighlightColor(index: Int) = context.dataStore.edit { it[Keys.highlightColor] = index }
    suspend fun setDisplayMode(mode: Int) = context.dataStore.edit { it[Keys.displayMode] = mode }
    suspend fun setMushafStyle(style: Int) = context.dataStore.edit { it[Keys.mushafStyle] = style }
    suspend fun setAyahOffset(offset: Int) = context.dataStore.edit { it[Keys.ayahOffset] = offset }

    suspend fun saveLastSession(
        reciter: Reciter,
        moshaf: Moshaf,
        surah: QuranSurah,
        ayahIndex: Int,
        positionMs: Long,
    ) {
        context.dataStore.edit { p ->
            p[Keys.sReciterId] = reciter.id
            p[Keys.sReciterName] = reciter.name
            p[Keys.sMoshafId] = moshaf.id
            p[Keys.sMoshafName] = moshaf.name
            p[Keys.sSurahId] = surah.id
            p[Keys.sSurahName] = surah.nameAr
            p[Keys.sAyah] = ayahIndex
            p[Keys.sPosition] = positionMs
            p[Keys.sUpdated] = System.currentTimeMillis()
        }
    }
}
