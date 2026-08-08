package com.qurantv.app.domain

import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

/**
 * Structured line data parsed from islamic.app mushaf page SVGs.
 *
 * The page's text lines are `<text x="…" y="…" font-size="…" text-anchor="…">`
 * elements whose `<tspan data-ayah="s:a">` children hold the ayah text with the
 * ayah-end marker (۝ + digits) embedded at the END of the last tspan of each
 * ayah. `y` is the BASELINE (SVG convention); glyphs sit above it.
 */
data class IslamicTspan(val ayahKey: String?, val text: String)

data class IslamicLine(
    val baselineY: Float,
    val fontSize: Float,
    val anchorX: Float,
    val anchor: String,
    val tspans: List<IslamicTspan>,
)

object IslamicPageBands {

    /** Parses the page's ayah text lines (in document order). */
    fun parseLines(svg: String): List<IslamicLine> {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = false
        runCatching { factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        runCatching { factory.setFeature("http://xml.org/sax/features/external-general-entities", false) }
        runCatching { factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false) }
        val doc = factory.newDocumentBuilder().parse(svg.byteInputStream())
        val lines = ArrayList<IslamicLine>()
        val texts = doc.getElementsByTagName("text")
        for (i in 0 until texts.length) {
            val text = texts.item(i) as? Element ?: continue
            val tspans = ArrayList<IslamicTspan>()
            collectTspans(text, tspans)
            if (tspans.isEmpty()) continue
            val y = text.getAttribute("y").toFloatOrNull() ?: continue
            val fs = text.getAttribute("font-size").toFloatOrNull() ?: continue
            val x = text.getAttribute("x").toFloatOrNull() ?: continue
            val anchor = text.getAttribute("text-anchor")
            lines += IslamicLine(
                baselineY = y,
                fontSize = fs,
                anchorX = x,
                anchor = anchor,
                tspans = tspans,
            )
        }
        return lines
    }

    private fun collectTspans(element: Element, out: MutableList<IslamicTspan>) {
        val children = element.childNodes
        for (i in 0 until children.length) {
            val node = children.item(i) as? Element ?: continue
            if (node.tagName == "tspan") {
                val key = node.getAttribute("data-ayah").takeIf { it.isNotBlank() }
                out += IslamicTspan(key, node.textContent ?: "")
            } else if (node.tagName == "text" || node.tagName == "tspan") {
                collectTspans(node, out)
            }
        }
    }
}
