package com.qurantv.app.ui.player

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

/**
 * Tajweed mushaf style: the current ayah rendered as its own color-tajweed
 * image (from the islamic.network CDN), framed with the highlight color.
 * Wide 1500px images are fitted to the content area width.
 */
@Composable
fun TajweedAyahView(
    bitmap: android.graphics.Bitmap?,
    highlightColor: Color,
    showBasmala: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        val bmp = bitmap
        if (bmp != null) {
            Box(
                modifier = Modifier
                    .padding(24.dp)
                    .border(3.dp, highlightColor, RoundedCornerShape(10.dp))
                    .background(Color.White, RoundedCornerShape(10.dp)),
            ) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier.padding(6.dp),
                    contentScale = ContentScale.FillWidth,
                )
            }
        } else if (showBasmala) {
            Text(
                text = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                text = "…",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
