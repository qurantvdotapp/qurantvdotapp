package com.qurantv.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SurahListParsingTest {

    @Test
    fun `parses plain comma list`() {
        assertEquals(listOf(1, 2, 3, 4), CatalogParsing.parseSurahList("1,2,3,4"))
    }

    @Test
    fun `tolerates trailing comma`() {
        assertEquals(listOf(1, 2, 3), CatalogParsing.parseSurahList("1,2,3,"))
    }

    @Test
    fun `tolerates empty segments and whitespace`() {
        assertEquals(listOf(1, 2, 3), CatalogParsing.parseSurahList("1,, 2 ,3,, "))
    }

    @Test
    fun `returns empty for null or blank`() {
        assertTrue(CatalogParsing.parseSurahList(null).isEmpty())
        assertTrue(CatalogParsing.parseSurahList("").isEmpty())
        assertTrue(CatalogParsing.parseSurahList("   ").isEmpty())
    }

    @Test
    fun `drops non numeric tokens`() {
        assertEquals(listOf(1), CatalogParsing.parseSurahList("1,abc,,"))
    }
}

class AudioUrlTest {

    @Test
    fun `adds trailing slash when missing`() {
        assertEquals("https://server6.mp3quran.net/akdr/", CatalogParsing.normalizeServerUrl("https://server6.mp3quran.net/akdr"))
    }

    @Test
    fun `keeps existing trailing slash`() {
        assertEquals("https://server6.mp3quran.net/akdr/", CatalogParsing.normalizeServerUrl("https://server6.mp3quran.net/akdr/"))
    }

    @Test
    fun `keeps subdirectory paths`() {
        assertEquals(
            "https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi/",
            CatalogParsing.normalizeServerUrl("https://server16.mp3quran.net/deban/Rewayat-Qalon-A-n-Nafi")
        )
    }

    @Test
    fun `builds zero padded mp3 url`() {
        assertEquals("https://server6.mp3quran.net/akdr/001.mp3", CatalogParsing.audioUrlFor("https://server6.mp3quran.net/akdr/", 1))
        assertEquals("https://server6.mp3quran.net/akdr/114.mp3", CatalogParsing.audioUrlFor("https://server6.mp3quran.net/akdr", 114))
        assertEquals("https://server6.mp3quran.net/akdr/037.mp3", CatalogParsing.audioUrlFor("https://server6.mp3quran.net/akdr", 37))
    }

    @Test
    fun `parses polygons with four corners`() {
        val polygon = CatalogParsing.parsePolygon("181.08,18.31 57.54,18.31 57.54,48.94 181.08,48.94")
        assertEquals(4, polygon?.size)
        assertEquals(181.08f, polygon?.get(0)?.x)
        assertEquals(48.94f, polygon?.get(3)?.y)
    }

    @Test
    fun `returns null for null or malformed polygons`() {
        assertNull(CatalogParsing.parsePolygon(null))
        assertNull(CatalogParsing.parsePolygon(""))
        assertNull(CatalogParsing.parsePolygon("abc"))
        assertNull(CatalogParsing.parsePolygon("1,2"))
    }
}

class TimingIndexTest {

    private fun timing(entries: List<Triple<Int, Long, Long>>) = SurahTiming(
        readId = 5,
        surahId = 1,
        entries = entries.map { (ayah, start, end) ->
            AyahTiming(ayah = ayah, startMs = start, endMs = end, polygon = null, x = null, y = null, pageUrl = null)
        },
    )

    @Test
    fun `finds correct ayah in the middle`() {
        val t = timing(listOf(Triple(0, 0L, 3000L), Triple(1, 3000L, 6000L), Triple(2, 6000L, 9000L)))
        assertEquals(0, TimingIndex.ayahAt(t, 0))
        assertEquals(0, TimingIndex.ayahAt(t, 2999))
        assertEquals(1, TimingIndex.ayahAt(t, 3000))
        assertEquals(1, TimingIndex.ayahAt(t, 5999))
        assertEquals(2, TimingIndex.ayahAt(t, 6000))
        assertEquals(2, TimingIndex.ayahAt(t, 8999))
    }

    @Test
    fun `clamps to last ayah after the end`() {
        val t = timing(listOf(Triple(0, 0L, 3000L), Triple(1, 3000L, 6000L)))
        assertEquals(1, TimingIndex.ayahAt(t, 60_000))
    }

    @Test
    fun `before the first entry returns index zero`() {
        val t = timing(listOf(Triple(0, 1000L, 3000L), Triple(1, 3000L, 6000L)))
        assertEquals(0, TimingIndex.ayahAt(t, 0))
    }

    @Test
    fun `skips zero width intervals`() {
        // Entry 1 has a zero-length interval and must be skipped.
        val t = timing(listOf(Triple(0, 0L, 3000L), Triple(1, 3000L, 3000L), Triple(2, 3000L, 9000L)))
        assertEquals(2, TimingIndex.ayahAt(t, 5000))
    }

    @Test
    fun `stays on the previous ayah during an inter ayah gap`() {
        // Ayah 1 ends at 6000; ayah 2 starts at 7500 (1500 ms of silence). The
        // highlight must NOT jump to ayah 2 while its audio has not started.
        val t = timing(listOf(Triple(0, 0L, 3000L), Triple(1, 3000L, 6000L), Triple(2, 7500L, 10_000L)))
        assertEquals(1, TimingIndex.ayahAt(t, 6500))
        assertEquals(1, TimingIndex.ayahAt(t, 7499))
        assertEquals(2, TimingIndex.ayahAt(t, 7500))
    }

    @Test
    fun `returns timing index not list position when the basmala entry is absent`() {
        // Reads without a timing index-0 (basmala) entry start at index 1 — the
        // list position would be one behind the timing index (off-by-one highlight).
        val t = timing(listOf(Triple(1, 3220L, 11_400L), Triple(2, 11_400L, 19_040L), Triple(3, 19_040L, 29_700L)))
        assertEquals(0, TimingIndex.ayahAt(t, 1000)) // virtual basmala slot
        assertEquals(1, TimingIndex.ayahAt(t, 3220))
        assertEquals(2, TimingIndex.ayahAt(t, 11_400))
        assertEquals(3, TimingIndex.ayahAt(t, 19_040))
        assertEquals(3, TimingIndex.ayahAt(t, 500_000))
    }

    @Test
    fun `empty timing returns -1`() {
        val t = timing(emptyList())
        assertEquals(-1, TimingIndex.ayahAt(t, 1000))
    }

    @Test
    fun `matches real surah 1 read 5 data`() {
        // Verified live values (read=5, surah=1): index 1 spans 2731..5720 (verse 1:1),
        // index 7 is the last entry (verse 1:7, ends at 37463).
        val t = SurahTiming(
            readId = 5,
            surahId = 1,
            entries = listOf(
                AyahTiming(0, 0, 2731, null, null, null, null),
                AyahTiming(1, 2731, 5720, null, 66.48f, 34.46f, "https://www.mp3quran.net/api/quran_pages_svg/001.svg"),
                AyahTiming(2, 5720, 10592, null, 43.55f, 63.20f, null),
                AyahTiming(3, 10592, 14142, null, null, null, null),
                AyahTiming(4, 14142, 17323, null, null, null, null),
                AyahTiming(5, 17323, 22468, null, null, null, null),
                AyahTiming(6, 22468, 25999, null, null, null, null),
                AyahTiming(7, 25999, 37463, null, null, null, null),
            ),
        )
        assertEquals(0, TimingIndex.ayahAt(t, 1000))
        assertEquals(1, TimingIndex.ayahAt(t, 2731))
        assertEquals(2, TimingIndex.ayahAt(t, 6000))
        assertEquals(7, TimingIndex.ayahAt(t, 37463))
        assertEquals(7, TimingIndex.ayahAt(t, 999_999))
    }
}

class PageMappingTest {

    @Test
    fun `maps 235 space to screen with verified rule`() {
        val vb = ViewBox(0f, 0f, 235f, 235f)
        val polygon = listOf(PointF(57.54f, 18.31f), PointF(181.08f, 18.31f), PointF(181.08f, 48.94f), PointF(57.54f, 48.94f))
        val screenW = 940f
        val screenH = 940f
        val mapped = PageMapping.toScreen(polygon, vb, screenW, screenH)
        assertEquals(57.54f * 940f / 235f, mapped[0].x, 0.01f)
        assertEquals(48.94f * 940f / 235f, mapped[3].y, 0.01f)
    }

    @Test
    fun `parses viewBox from svg string`() {
        val svg = """<?xml version="1.0"?><svg viewBox="0 0 235 235" xmlns="http://www.w3.org/2000/svg"/>"""
        val vb = PageMapping.parseViewBox(svg)
        assertEquals(235f, vb?.w)
        assertEquals(235f, vb?.h)
    }

    @Test
    fun `handles non-square viewBox pages`() {
        // Live-verified: page 187 uses viewBox "0 0 345 550".
        val vb = PageMapping.parseViewBox("""<svg viewBox="0 0 345 550"></svg>""")!!
        assertEquals(345f, vb.w)
        assertEquals(550f, vb.h)
        val polygon = listOf(PointF(0f, 42.32f), PointF(343f, 42.32f), PointF(343f, 85.5f), PointF(0f, 85.5f))
        val mapped = PageMapping.toScreen(polygon, vb, 690f, 1100f)
        assertEquals(0f, mapped[0].x, 0.01f)
        assertEquals(686f, mapped[1].x, 0.01f) // 343 * 690/345
        assertEquals(171f, mapped[2].y, 0.01f) // 85.5 * 1100/550
    }

    @Test
    fun `returns empty for degenerate screen size`() {
        val vb = ViewBox(0f, 0f, 235f, 235f)
        assertTrue(PageMapping.toScreen(listOf(PointF(1f, 1f)), vb, 0f, 0f).isEmpty())
    }
}

class BasmalaOffsetTest {

    @Test
    fun `hafs layout keeps offset zero`() {
        // surah 2: 287 timing entries = 1 header + 286 verses
        assertEquals(0, BasmalaOffset.suggestOffset(287, 286))
        // surah 9: 130 entries = 1 header slot + 129 verses
        assertEquals(0, BasmalaOffset.suggestOffset(130, 129))
        // surah 1: 8 entries = 1 header + 7 verses
        assertEquals(0, BasmalaOffset.suggestOffset(8, 7))
    }

    @Test
    fun `non-hafs basmala counted as verse suggests offset one`() {
        // basmala counted as a numbered verse + header slot → verses + 2
        assertEquals(1, BasmalaOffset.suggestOffset(288, 286))
    }

    @Test
    fun `maps timing index to verse key`() {
        assertEquals("2:1", BasmalaOffset.verseKeyFor(1, 2, 286, 0))
        assertEquals("2:286", BasmalaOffset.verseKeyFor(286, 2, 286, 0))
        assertEquals("9:1", BasmalaOffset.verseKeyFor(1, 9, 129, 0))
        assertNull(BasmalaOffset.verseKeyFor(0, 2, 286, 0)) // header
        assertNull(BasmalaOffset.verseKeyFor(287, 2, 286, 0)) // out of range
    }

    @Test
    fun `offset shifts the mapping by one`() {
        assertEquals("2:1", BasmalaOffset.verseKeyFor(2, 2, 286, 1))
        assertNull(BasmalaOffset.verseKeyFor(1, 2, 286, 1))
    }

    @Test
    fun `surah one header index has no verse`() {
        assertNull(BasmalaOffset.verseKeyFor(0, 1, 7, 0))
        assertEquals("1:1", BasmalaOffset.verseKeyFor(1, 1, 7, 0))
        assertEquals("1:7", BasmalaOffset.verseKeyFor(7, 1, 7, 0))
    }
}

class SurahTimingLookupTest {

    private fun timing(entries: List<Triple<Int, Long, Long>>) = SurahTiming(
        readId = 5,
        surahId = 1,
        entries = entries.map { (ayah, start, end) ->
            AyahTiming(ayah = ayah, startMs = start, endMs = end, polygon = null, x = null, y = null, pageUrl = null)
        },
    )

    @Test
    fun `entryFor finds the entry by timing index`() {
        val t = timing(listOf(Triple(0, 0L, 3000L), Triple(1, 3000L, 6000L), Triple(2, 6000L, 9000L)))
        assertEquals(0L, t.entryFor(0)?.startMs)
        assertEquals(3000L, t.entryFor(1)?.startMs)
        assertEquals(9000L, t.entryFor(2)?.endMs)
        assertNull(t.entryFor(3))
    }

    @Test
    fun `entryFor handles reads without a basmala entry`() {
        // List position 0 holds timing index 1 — entryFor(1) must resolve it.
        val t = timing(listOf(Triple(1, 3220L, 11_400L), Triple(2, 11_400L, 19_040L)))
        assertEquals(3220L, t.entryFor(1)?.startMs)
        assertEquals(19_040L, t.entryFor(2)?.endMs)
        assertNull(t.entryFor(0)) // virtual basmala slot — no entry
        assertEquals(2, t.lastAyahIndex)
    }
}

class IslamicPageBandsTest {

    private val sampleSvg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <text x="360" y="163.16" font-size="32.4">
    <tspan data-ayah="1:1">بِسْمِ اللَّهِ</tspan>
  </text>
  <text x="360" y="213.38" font-size="32.4">
    <tspan data-ayah="1:2">الْحَمْدُ لِلَّهِ</tspan><tspan data-ayah="1:3">الرَّحْمَٰنِ</tspan>
  </text>
  <text x="360" y="263.60" font-size="22">
    <tspan data-ayah="1:4">مَالِكِ يَوْمِ الدِّينِ</tspan>
  </text>
</svg>""".trimIndent()

    @Test
    fun `extracts one band per text line the ayah occupies`() {
        val bands = IslamicPageBands.parse(sampleSvg)
        val a1 = bands["1:1"]!!.first()
        assertEquals(1, bands["1:1"]?.size)
        assertEquals(163.16f, a1.yTop)
        // 32.4 * 1.35 line height
        assertEquals(163.16f + 32.4f * 1.35f, a1.yBottom, 0.01f)
        // two tspans on the same line → one distinct band
        assertEquals(1, bands["1:2"]?.size)
        assertEquals(1, bands["1:3"]?.size)
        assertEquals(213.38f, bands["1:3"]!!.first().yTop)
        // smaller font-size honored
        assertEquals(263.60f + 22f * 1.35f, bands["1:4"]!!.first().yBottom, 0.01f)
    }

    @Test
    fun `ignores tspans without data-ayah`() {
        val bands = IslamicPageBands.parse(sampleSvg)
        assertNull(bands["1:5"])
        assertTrue(bands.isEmpty() == false)
    }
}
