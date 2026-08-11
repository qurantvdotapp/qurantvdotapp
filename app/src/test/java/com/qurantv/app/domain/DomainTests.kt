package com.qurantv.app.domain

import com.qurantv.app.ui.home.reciterMatchesQuery
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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

class KsuHiliteGeometryTest {

    private fun ayahEnd(s: Int, a: Int, x: Int, y: Int) =
        KsuHiliteGeometry.AyahEnd(s, a, x, y)

    @Test
    fun `first ayah on a page spans from the text top to its end as three rects`() {
        // Verified tajweed page 9 data: 2_58 ends at [248, 136].
        val rects = KsuHiliteGeometry.build(
            ayahs = listOf(ayahEnd(2, 58, 248, 136), ayahEnd(2, 59, 223, 222)),
            page = 9,
            meta = KsuHiliteGeometry.TAJWEED,
            imageWidth = 456,
            imageHeight = 707,
        )
        val r58 = rects["2:58"]!!
        // prev_top = pageTop = 30; top = 136-20 = 116; diff 86 > 1.6*40 -> 3 rects.
        // Fractions are computed in the page image's NATIVE pixel space (456×707),
        // not the old display-space height (720) — that drift left the highlight
        // short of the line in the lower half of the page.
        assertEquals(3, r58.size)
        // tail of the first line (left margin 25 .. twidth 427, y 30..70)
        val r1 = r58[0]
        assertEquals(25f / 456f, r1.left, 0.001f)
        assertEquals(30f / 707f, r1.top, 0.001f)
        assertEquals(427f / 456f, r1.right, 0.001f)
        assertEquals(70f / 707f, r1.bottom, 0.001f)
        // this ayah's last partial line: left = 248-17 = 231, y 116..156
        val r2 = r58[1]
        assertEquals(231f / 456f, r2.left, 0.001f)
        assertEquals(116f / 707f, r2.top, 0.001f)
        // full-width middle block y 70..116
        val r3 = r58[2]
        assertEquals(70f / 707f, r3.top, 0.001f)
        assertEquals(116f / 707f, r3.bottom, 0.001f)
    }

    @Test
    fun `warsh ayah ends stay in the site's display space`() {
        // Verified warsh p192: 9_35 ends [316,502], 9_36 ends [47,685]. The
        // warsh API is DISPLAY-scaled (site renders the 1005-tall image at 760,
        // so display-space line pitch 46.2 = native 61 × 760/1005 — 49/49 ayah
        // gaps on pages 190–199 fit the display pitch). 9:36's last partial line
        // band [665,705] display = native ink 659..707 of line 11 — dividing by
        // the native height instead would put it ~220px too high.
        val rects = KsuHiliteGeometry.build(
            ayahs = listOf(ayahEnd(9, 35, 316, 502), ayahEnd(9, 36, 47, 685)),
            page = 192,
            meta = KsuHiliteGeometry.WARSH,
            imageWidth = 620,
            imageHeight = 1005,
        )
        val r36 = rects["9:36"]!!
        val spaceW = 620f * 760f / 1005f
        val last = r36[1]
        assertEquals(30f / spaceW, last.left, 0.001f)   // 47-17
        assertEquals(665f / 760f, last.top, 0.001f)     // 685-20
        assertEquals(427f / spaceW, last.right, 0.001f)
        assertEquals(705f / 760f, last.bottom, 0.001f)  // 665+40
    }

    @Test
    fun `last line of the page spans the full native line ink`() {
        // Verified: tajweed p9 2_61 ends at [46,648] — the vertical CENTER of
        // the last text line (ink 642..666). The band [y-20, y+20] = [628,668]
        // must render in native fractions of the 707-tall image so it covers
        // the whole line — with the old display-space height (720) it drifted
        // ~12px short (the reported “stops mid-height, lower half” bug).
        val rects = KsuHiliteGeometry.build(
            ayahs = listOf(ayahEnd(2, 60, 46, 351), ayahEnd(2, 61, 46, 648)),
            page = 9,
            meta = KsuHiliteGeometry.TAJWEED,
            imageWidth = 456,
            imageHeight = 707,
        )
        val r61 = rects["2:61"]!!
        // 2_61's last partial line: left = 46-17 = 29, top = 648-20 = 628,
        // bottom = 628+40 = 668 — native fractions of 456×707.
        val last = r61[1]
        assertEquals(29f / 456f, last.left, 0.001f)
        assertEquals(628f / 707f, last.top, 0.001f)
        assertEquals(427f / 456f, last.right, 0.001f)
        assertEquals(668f / 707f, last.bottom, 0.001f)
    }

    @Test
    fun `two ayahs ending on the same line collapse to one rect`() {
        // 2_59 ends [223,222] and 2_60 ends [46,351] -> gap 129 > 64: 3 rects.
        // Same-line case: 1_3 [243,353] and 1_4 [138,352] on page 1 (fp layout).
        val rects = KsuHiliteGeometry.build(
            ayahs = listOf(ayahEnd(1, 3, 243, 353), ayahEnd(1, 4, 138, 352)),
            page = 1,
            meta = KsuHiliteGeometry.HAFS,
            imageWidth = 456,
            imageHeight = 672,
        )
        val r4 = rects["1:4"]!!
        // fp layout: ofheight 10 -> top = 352-10 = 342, prev top = 353-10 = 343,
        // diff = -1 -> same line -> single rect from prev left (243-5) to left (138-5).
        // Native space: fractions are of the 456-wide image directly.
        assertEquals(1, r4.size)
        assertEquals(138f - 5f, r4[0].left * 456f, 1.5f)
        assertEquals(243f - 5f, r4[0].right * 456f, 1.5f)
    }

    @Test
    fun `page two opening spread uses fp layout`() {
        val rects = KsuHiliteGeometry.build(
            ayahs = listOf(ayahEnd(2, 1, 283, 324), ayahEnd(2, 2, 284, 352)),
            page = 2,
            meta = KsuHiliteGeometry.HAFS,
            imageWidth = 456,
            imageHeight = 672,
        )
        val r1 = rects["2:1"]!!
        // fp: ofheight 10 -> top = 314; prev_top = 270 (opening spread); diff 44 > 32
        // (1.6*fpHeight 20) -> 3 rects; the last partial line starts at x = 283-5.
        assertEquals(3, r1.size)
        assertEquals(278f, r1[1].left * 456f, 1.5f)
    }

    @Test
    fun `empty input yields no rects`() {
        assertTrue(
            KsuHiliteGeometry.build(emptyList(), 9, KsuHiliteGeometry.TAJWEED, 456, 707).isEmpty()
        )
    }
}

class PageAyahEstimatorTest {

    @Test
    fun `long ayahs get proportionally tall bands in order`() {
        // Page 3 of surah 2 (2:6..2:16): verse lengths differ a lot.
        val ayahs = (6..16).toList()
        // fake lengths: 2:6 is longest-ish, later verses shorter
        val lengths = ayahs.map { 50 - it } // descending: 44..34
        val bands = PageAyahEstimator.estimate(ayahs, lengths, pageStartsSurah = false)
        assertEquals(ayahs.size, bands.size)
        // ascending order, non-overlapping, within (0,1)
        var prevBottom = 0f
        for (a in ayahs) {
            val b = bands[a]!!
            assertTrue(b.yTop >= prevBottom - 0.001f)
            assertTrue(b.yBottom > b.yTop)
            assertTrue(b.yBottom <= 1.0f)
            prevBottom = b.yBottom
        }
        // first band starts just below the top margin
        assertTrue(bands[6]!!.yTop >= 0.02f)
        // last band ends at the bottom margin
        assertTrue(bands[16]!!.yBottom <= 0.98f)
    }

    @Test
    fun `surah-start pages reserve the header`() {
        val bands = PageAyahEstimator.estimate(listOf(1, 2), listOf(100, 100), pageStartsSurah = true)
        val top = bands[1]!!.yTop
        // header ≈ 2/15 of the page
        assertTrue(top >= 2f / 15f)
        assertTrue(top < 0.2f)
    }

    @Test
    fun `empty input yields no bands`() {
        assertTrue(PageAyahEstimator.estimate(emptyList(), emptyList(), false).isEmpty())
    }
}

class KsuWarshPageDataTest {

    @Test
    fun `maps known verses to warsh pages`() {
        // Verified against quran.ksu.edu.sa quran-data.js Page_warsh (Tanzil-sourced).
        assertEquals(2, KsuWarshPageData.warshPageFor(2, 1))
        assertEquals(3, KsuWarshPageData.warshPageFor(2, 6))
        assertEquals(42, KsuWarshPageData.warshPageFor(2, 255))
        assertEquals(48, KsuWarshPageData.warshPageFor(2, 282))
        assertEquals(518, KsuWarshPageData.warshPageFor(50, 1))
        assertEquals(1, KsuWarshPageData.warshPageFor(1, 1))
        assertEquals(187, KsuWarshPageData.warshPageFor(9, 1))
    }

    @Test
    fun `returns null below the first page`() {
        assertNull(KsuWarshPageData.warshPageFor(0, 0))
    }

    @Test
    fun `clamps valid ranges to a page`() {
        // Lookup is a pagination map; any in-range key resolves to a page.
        assertNotNull(KsuWarshPageData.warshPageFor(1, 8)) // not a real verse, but maps near page 1
        assertNotNull(KsuWarshPageData.warshPageFor(114, 6)) // final surah
    }
}

class TimingAccuracyTest {

    @Test
    fun `consistent reads are reliable`() {
        // Verified: reads 5/13/17/62/273 surah 2 — mp3 duration ≈ timing total
        // (ratio 1.000 ± 0.002; the tiny remainder is trailing silence).
        assertTrue(TimingAccuracy.isReliable(6_705_000L, 6_704_000L))
        assertTrue(TimingAccuracy.isReliable(6_641_000L, 6_638_900L))
        assertTrue(TimingAccuracy.isReliable(6_906_000L, 6_904_000L))
        assertTrue(TimingAccuracy.isReliable(5_964_000L, 5_970_000L))
        assertTrue(TimingAccuracy.isReliable(7_200_000L, 7_183_000L))
    }

    @Test
    fun `compressed timing is unreliable`() {
        // Verified: read 135 (السويّد) s2 — mp3 6757 s vs timing 6039 s (1.119);
        // read 259 (أحمد النفيس) 1.095. Sync is disabled, never estimated.
        assertFalse(TimingAccuracy.isReliable(6_757_368L, 6_038_900L))
        assertFalse(TimingAccuracy.isReliable(8_164_000L, 7_455_000L))
    }

    @Test
    fun `stretched timing is unreliable`() {
        // Verified: read 137 (أحمد طالب بن حميد) s2 — mp3 5874 s vs timing
        // 7458 s (0.788).
        assertFalse(TimingAccuracy.isReliable(5_874_000L, 7_458_000L))
    }

    @Test
    fun `implausible durations are unreliable`() {
        assertFalse(TimingAccuracy.isReliable(0L, 6_000_000L))
        assertFalse(TimingAccuracy.isReliable(6_000_000L, 0L))
        // A wildly different file (wrong surah) is never treated as reliable.
        assertFalse(TimingAccuracy.isReliable(10_000L, 6_000_000L))
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

    private fun width(text: String, fontSize: Float): Float = text.length * fontSize * 0.5f

    @Test
    fun `parses lines with baselines and tspans`() {
        val lines = IslamicPageBands.parseLines(sampleSvg)
        assertEquals(3, lines.size)
        assertEquals(163.16f, lines[0].baselineY)
        assertEquals(32.4f, lines[0].fontSize)
        assertEquals(1, lines[0].tspans.size)
        assertEquals("1:1", lines[0].tspans[0].ayahKey)
        // line 2 has two ayahs (1:2 tail + 1:3 head)
        assertEquals(listOf("1:2", "1:3"), lines[1].tspans.map { it.ayahKey })
    }

    @Test
    fun `same-line ayahs get a rect between their end positions`() {
        val lines = IslamicPageBands.parseLines(sampleSvg)
        val rects = IslamicHiliteRects.build(lines, 720f, 720f, ::width)
        // 1:2 and 1:3 both end on line 2 (y=213.38) -> single rect each
        val r3 = rects["1:3"]!!
        assertEquals(1, r3.size)
        // vertical band covers the glyphs (baseline in the middle), not below them
        assertTrue(r3[0].top * 720f < 213.38f)
        assertTrue(r3[0].bottom * 720f > 213.38f)
        assertEquals(213.38f - 32.4f * 0.95f, r3[0].top * 720f, 0.5f)
        assertEquals(213.38f + 32.4f * 0.35f, r3[0].bottom * 720f, 0.5f)
    }

    @Test
    fun `multi-line ayah gets first and last line rects`() {
        val svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
  <text x="360" y="100" font-size="30">
    <tspan data-ayah="2:1">TEXT_A AYAH_ONE_WORDS</tspan>
  </text>
  <text x="360" y="160" font-size="30">
    <tspan data-ayah="2:2">MORE TEXT HERE FOR TWO</tspan>
  </text>
  <text x="360" y="220" font-size="30">
    <tspan data-ayah="2:2">LAST BIT</tspan>
  </text>
</svg>""".trimIndent()
        val lines = IslamicPageBands.parseLines(svg)
        val rects = IslamicHiliteRects.build(lines, 720f, 720f, ::width)
        // 2:2 spans lines 2..3 (no middle lines) -> 2 rects
        val r2 = rects["2:2"]!!
        assertEquals(2, r2.size)
        // first rect on line 2's band, last rect on line 3's band
        assertEquals(160f - 30f * 0.95f, r2[0].top * 720f, 0.5f)
        assertEquals(220f - 30f * 0.95f, r2[1].top * 720f, 0.5f)
        // 2:2 starts at line 2's right edge (525) — first rect spans the line
        assertEquals(525f, r2[0].right * 720f, 0.5f)
        // ...and ends on line 3 at its tspan end (300) — last rect to line 3's right
        assertEquals(300f, r2[1].left * 720f, 0.5f)
        assertEquals(420f, r2[1].right * 720f, 0.5f)
    }
}

class ReciterSearchTest {

    private fun reciter(name: String, letter: String? = null) = Reciter(
        id = name.hashCode(),
        name = name,
        letter = letter,
        moshafs = listOf(Moshaf(1, "حفص", "https://example/", null, null, null, emptyList())),
    )

    @Test
    fun `exact arabic name matches`() {
        assertTrue(reciterMatchesQuery(reciter("محمود خليل الحصري"), "الحصري"))
    }

    @Test
    fun `partial name matches`() {
        assertTrue(reciterMatchesQuery(reciter("عبدالباسط عبدالصمد"), "عبدالباسط"))
        assertTrue(reciterMatchesQuery(reciter("مشاري العفاسي"), "عفاسي"))
    }

    @Test
    fun `hamza variants are normalized`() {
        // Typed without the hamza on أ still matches أحمد.
        assertTrue(reciterMatchesQuery(reciter("أحمد بن علي العجمي"), "احمد"))
        assertTrue(reciterMatchesQuery(reciter("أحمد الحواشي"), "أحمد الحواشي"))
    }

    @Test
    fun `alif maqsura and ta marbuta are normalized`() {
        assertTrue(reciterMatchesQuery(reciter("مصطفى إسماعيل"), "مصطفي اسماعيل"))
        assertTrue(reciterMatchesQuery(reciter("عبدالرحمن السديس"), "السديس"))
    }

    @Test
    fun `initial letter matches`() {
        assertTrue(reciterMatchesQuery(reciter("مشاري العفاسي", "م"), "م"))
        assertFalse(reciterMatchesQuery(reciter("مشاري العفاسي", "م"), "ح"))
    }

    @Test
    fun `empty query matches everything`() {
        assertTrue(reciterMatchesQuery(reciter("أي أحد"), ""))
        assertTrue(reciterMatchesQuery(reciter("أي أحد"), "   "))
    }

    @Test
    fun `non matching returns false`() {
        assertFalse(reciterMatchesQuery(reciter("محمود خليل الحصري"), "المنشاوي"))
    }
}
