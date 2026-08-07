package com.qurantv.app.domain

import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

/**
 * One horizontal highlight band on a mushaf page, in the page's viewBox
 * coordinate space. Full-width translucent rect drawn between [yTop] and
 * [yBottom] (e.g. the line(s) of text an ayah occupies).
 */
data class PageAyahBand(val yTop: Float, val yBottom: Float)

/**
 * Extracts per-ayah highlight bands from islamic.app mushaf page SVGs
 * (verified live: `https://api.islamic.app/v1/mushaf/page/{page}.svg`).
 *
 * Every page of the standard Madinah Mushaf (604 pages, same pagination as the
 * mp3quran timing `page` field) is a CORS-open SVG with `viewBox="0 0 720 720"`
 * where every `<tspan>` carries `data-ayah="surah:ayah"`. Lines are `<text>`
 * elements with `x/y/font-size`; an ayah's highlight is the union of the line
 * bands its tspans appear on (a line may carry the tail of one ayah and the
 * head of the next — the full line is highlighted, like other mushaf apps).
 */
object IslamicPageBands {

    private val AYAHS_ATTR = "data-ayah"

    /** Parses the SVG text into `verseKey -> line bands` (viewBox units). */
    fun parse(svg: String): Map<String, List<PageAyahBand>> {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = false
        // Be strict about entity expansion (the SVG is remote content).
        runCatching { factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        runCatching { factory.setFeature("http://xml.org/sax/features/external-general-entities", false) }
        runCatching { factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
        val doc = factory.newDocumentBuilder().parse(svg.byteInputStream())
        val bands = HashMap<String, MutableList<PageAyahBand>>()
        val tspans = doc.getElementsByTagName("tspan")
        for (i in 0 until tspans.length) {
            val tspan = tspans.item(i) as? Element ?: continue
            val verseKey = tspan.getAttribute(AYAHS_ATTR).takeIf { it.isNotBlank() } ?: continue
            // Walk up to the nearest <text> ancestor for the line position/size.
            var node = tspan.parentNode
            var lineY: Float? = null
            var fontSize: Float? = null
            while (node != null) {
                val el = node as? Element ?: run { node = node.parentNode; continue }
                if (el.tagName == "text") {
                    lineY = el.getAttribute("y").toFloatOrNull()
                    if (fontSize == null) fontSize = el.getAttribute("font-size").toFloatOrNull()
                    break
                }
                node = node.parentNode
            }
            val y = lineY ?: continue
            val size = (tspan.getAttribute("font-size").toFloatOrNull() ?: fontSize) ?: 32f
            bands.getOrPut(verseKey) { ArrayList() }
                .add(PageAyahBand(y, y + size * 1.35f))
        }
        return bands.mapValues { (_, list) -> list.distinct() }
    }
}
