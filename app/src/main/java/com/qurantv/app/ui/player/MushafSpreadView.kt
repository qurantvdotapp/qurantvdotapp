package com.qurantv.app.ui.player

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.qurantv.app.domain.KsuHiliteGeometry
import com.qurantv.app.domain.PageAyahBand
import com.qurantv.app.domain.PointF
import com.qurantv.app.domain.ViewBox

private const val SPINE = 10f
private const val SPINE_SHADOW = 14f

/** One side of the two-page mushaf spread. */
data class SpreadSide(
    val bitmap: ImageBitmap? = null,
    val viewBox: ViewBox? = null,
    val polygon: List<PointF>? = null,
    val bands: List<PageAyahBand>? = null,
    val bandsFractional: Boolean = false,
    val rects: List<KsuHiliteGeometry.Rect>? = null,
)

/**
 * The two visible mushaf pages — like a real mushaf, an ODD page sits on the
 * RIGHT and the next EVEN page on the LEFT. [key] = the spread's right page
 * number; the highlight lives on whichever side holds the current ayah.
 */
data class SpreadState(
    val right: SpreadSide? = null,
    val left: SpreadSide? = null,
    val key: Int = 0,
)

/**
 * Two-page mushaf spread with a realistic page-turn:
 *  - when the spread changes (recitation crosses to the NEXT spread) the new
 *    spread slides in from the LEFT while the old one slides out to the RIGHT;
 *  - moving backwards reverses the direction;
 *  - highlight moving between the two sides (same spread) is instant.
 */
@Composable
fun MushafSpreadView(
    spread: SpreadState,
    highlightColor: Color,
    modifier: Modifier = Modifier,
    // Tafseer option: when set, the mushaf page that is NOT reciting is
    // replaced by the tafseer panel ([tafseerOnLeft] says which side).
    tafseer: com.qurantv.app.domain.AyahTafseer? = null,
    tafseerOnLeft: Boolean = false,
    tafseerVerseLabel: String = "",
    tafseerAyahText: String = "",
    tafseerFocus: FocusRequester? = null,
    onTafseerFocusChanged: (Boolean) -> Unit = {},
) {
    AnimatedContent(
        targetState = spread,
        modifier = modifier,
        contentKey = { it.key },
        transitionSpec = {
            val forward = targetState.key > initialState.key
            if (forward) {
                // NEXT page: the new spread slides in from the LEFT while the old
                // one slides out to the RIGHT (the reverse of a leftward flow).
                (slideInHorizontally { -it / 3 } + fadeIn(tween(320))) togetherWith
                    (slideOutHorizontally { it / 4 } + fadeOut(tween(320)))
            } else {
                (slideInHorizontally { it / 3 } + fadeIn(tween(320))) togetherWith
                    (slideOutHorizontally { -it / 4 } + fadeOut(tween(320)))
            }
        },
    ) { target ->
        // Force RTL so the mushaf always opens right-page-first regardless of
        // the UI language direction.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Row(
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                // In RTL the first child is the RIGHT page — align it toward the
                // spine (its left/end edge) so the two pages meet realistically.
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (tafseer != null && !tafseerOnLeft) {
                        // The RIGHT side is not reciting — show the tafseer here.
                        TafseerPanel(
                            verseLabel = tafseerVerseLabel,
                            ayahText = tafseerAyahText,
                            tafseer = tafseer,
                            focusRequester = tafseerFocus,
                            onFocusChanged = onTafseerFocusChanged,
                        )
                    } else {
                        PageModeView(
                            bitmap = target.right?.bitmap,
                            viewBox = target.right?.viewBox,
                            polygon = target.right?.polygon,
                            highlightColor = highlightColor,
                            bands = target.right?.bands,
                            bandsFractional = target.right?.bandsFractional ?: false,
                            rects = target.right?.rects,
                            alignment = Alignment.CenterEnd,
                        )
                    }
                    // Inner edge shadow toward the spine — darkest AT the spine,
                    // fading INTO the page (a real page's edge shadow).
                    Box(
                        Modifier
                            .fillMaxHeight()
                            .width(SPINE_SHADOW.dp)
                            .align(Alignment.CenterEnd)
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(Color.Black.copy(alpha = 0.45f), Color.Transparent),
                                ),
                            ),
                    )
                }
                // The folded spine: a ribbon joining the two pages like a real mushaf.
                Box(
                    Modifier
                        .width(SPINE.dp)
                        .fillMaxHeight()
                        .background(
                            Brush.verticalGradient(
                                listOf(
                                    Color(0xFF3A3126),
                                    Color(0xFF5C4F3C),
                                    Color(0xFF7A6A50),
                                    Color(0xFF5C4F3C),
                                    Color(0xFF3A3126),
                                ),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .fillMaxHeight()
                            .width(2.dp)
                            .background(Color.Black.copy(alpha = 0.5f)),
                    )
                }
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    if (tafseer != null && tafseerOnLeft) {
                        // The LEFT side is not reciting — show the tafseer here.
                        TafseerPanel(
                            verseLabel = tafseerVerseLabel,
                            ayahText = tafseerAyahText,
                            tafseer = tafseer,
                            focusRequester = tafseerFocus,
                            onFocusChanged = onTafseerFocusChanged,
                        )
                    } else {
                        PageModeView(
                            bitmap = target.left?.bitmap,
                            viewBox = target.left?.viewBox,
                            polygon = target.left?.polygon,
                            highlightColor = highlightColor,
                            bands = target.left?.bands,
                            bandsFractional = target.left?.bandsFractional ?: false,
                            rects = target.left?.rects,
                            alignment = Alignment.CenterStart,
                        )
                    }
                    // Inner edge shadow toward the spine.
                    Box(
                        Modifier
                            .fillMaxHeight()
                            .width(SPINE_SHADOW.dp)
                            .align(Alignment.CenterStart)
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.45f)),
                                ),
                            ),
                    )
                }
            }
        }
    }
}
