package com.qurantv.app.domain

/**
 * Defensive parsing helpers for the mp3quran catalog.
 *
 * Gotchas handled (PROMPT.md Part 14):
 *  - `surah_list` is a comma separated string and may end with a trailing comma.
 *  - server URLs may or may not end with `/` and may contain subdirectories.
 */
object CatalogParsing {

    fun parseSurahList(raw: String?): List<Int> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .mapNotNull { it.toIntOrNull() }
    }

    /** Always ends with a single trailing slash. */
    fun normalizeServerUrl(server: String): String {
        val trimmed = server.trim()
        if (trimmed.isEmpty()) return trimmed
        return if (trimmed.endsWith('/')) trimmed else "$trimmed/"
    }

    /** mp3quran audio URL rule (verified): `{server}{surah:03d}.mp3`. */
    fun audioUrlFor(server: String, surahId: Int): String =
        normalizeServerUrl(server) + surahId.toString().padStart(3, '0') + ".mp3"

    /** Parses a polygon string such as "181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94". */
    fun parsePolygon(raw: String?): List<PointF>? {
        if (raw.isNullOrBlank()) return null
        val points = raw.trim()
            .split(Regex("\\s+"))
            .mapNotNull { pair ->
                val parts = pair.split(',')
                if (parts.size != 2) return@mapNotNull null
                val x = parts[0].trim().toFloatOrNull() ?: return@mapNotNull null
                val y = parts[1].trim().toFloatOrNull() ?: return@mapNotNull null
                PointF(x, y)
            }
        return if (points.size >= 3) points else null
    }
}
