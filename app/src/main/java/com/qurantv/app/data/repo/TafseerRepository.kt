package com.qurantv.app.data.repo

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.qurantv.app.domain.AyahTafseer
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Simplified tafseer + word meanings + translation for every ayah, from the
 * KSU Ayat app's bundled databases (التفسير الميسر, معاني الكلمات and the
 * English Sahih International translation) — each a SQLite table keyed by
 * (sura, aya) with one row per ayah. The databases ship as app assets and are
 * copied to the files dir on first use (SQLite needs a real path), then
 * queried per ayah and cached in memory.
 */
class TafseerRepository(private val context: Context) {

    private val cache = HashMap<Int, AyahTafseer>()

    /** Tafseer for (surah, ayah), or null when unavailable. */
    suspend fun tafseerFor(surah: Int, ayah: Int): AyahTafseer? = withContext(Dispatchers.IO) {
        val key = surah * 1000 + ayah
        cache[key]?.let { return@withContext it }
        try {
            val muyassar = query("ar_muyassar", surah, ayah)
            val ma3any = query("ar_ma3any", surah, ayah)
            val en = query("en_sahih", surah, ayah)
            if (muyassar == null && ma3any == null && en == null) return@withContext null
            AyahTafseer(
                tafseer = muyassar ?: "",
                wordMeanings = ma3any ?: "",
                translation = en ?: "",
            ).also { cache[key] = it }
        } catch (e: Exception) {
            null
        }
    }

    private fun query(table: String, surah: Int, ayah: Int): String? {
        val db = openDb(table) ?: return null
        try {
            db.rawQuery(
                "SELECT text FROM $table WHERE sura=? AND aya=?",
                arrayOf(surah.toString(), ayah.toString()),
            ).use { cursor ->
                return if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } finally {
            runCatching { db.close() }
        }
    }

    private fun openDb(table: String): SQLiteDatabase? {
        return try {
            val file = File(context.filesDir, "tafseer_$table.db")
            if (!file.exists()) {
                context.assets.open("tafseer/$table.ayt").use { input ->
                    file.outputStream().use { output -> input.copyTo(output) }
                }
            }
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY)
        } catch (e: Exception) {
            null
        }
    }
}
