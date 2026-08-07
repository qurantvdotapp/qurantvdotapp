package com.qurantv.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.qurantv.app.R
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.di.AppContainer
import com.qurantv.app.ui.components.TvCard
import com.qurantv.app.ui.components.TvIconButton

@Composable
fun SettingsScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onLanguageChange: (String) -> Unit,
) {
    val vm = container.settingsViewModel
    val settings by vm.settings.collectAsState()

    Column(
        Modifier
            .fillMaxSize()
            .background(com.qurantv.app.ui.theme.BackgroundBrush)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 48.dp, vertical = 20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TvIconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.width(16.dp))
            Text(
                text = stringResource(R.string.settings),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        Spacer(Modifier.width(24.dp))

        SettingsSection(title = stringResource(R.string.language)) {
            OptionRow(
                options = listOf(
                    stringResource(R.string.arabic) to "ar",
                    stringResource(R.string.english) to "en",
                ),
                selected = settings.language,
                onSelect = { value -> onLanguageChange(value) },
            )
        }

        SettingsSection(title = stringResource(R.string.default_speed)) {
            OptionRow(
                options = listOf(
                    "0.5×" to 0.5f,
                    "0.75×" to 0.75f,
                    "1×" to 1f,
                    "1.25×" to 1.25f,
                    "1.5×" to 1.5f,
                    "2×" to 2f,
                ),
                selected = settings.defaultSpeed,
                onSelect = { value -> vm.setDefaultSpeed(value) },
            )
        }

        SettingsSection(title = stringResource(R.string.font_size)) {
            OptionRow(
                options = listOf(
                    stringResource(R.string.font_small) to 0,
                    stringResource(R.string.font_normal) to 1,
                    stringResource(R.string.font_large) to 2,
                ),
                selected = settings.fontSizeIndex,
                onSelect = { value -> vm.setFontSize(value) },
            )
        }

        SettingsSection(title = stringResource(R.string.highlight_color)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf(
                    Color(0xFFFFD54F) to 0,
                    Color(0xFF81C784) to 1,
                    Color(0xFF4FC3F7) to 2,
                ).forEach { (color, index) ->
                    val selected = settings.highlightColorIndex == index
                    TvCard(
                        onClick = { vm.setHighlightColor(index) },
                        backgroundColor = if (selected) MaterialTheme.colorScheme.primaryContainer
                        else com.qurantv.app.ui.theme.SurfaceContainer,
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(18.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.foundation.layout.Box(
                                Modifier
                                    .width(36.dp)
                                    .height(36.dp)
                                    .background(color, androidx.compose.foundation.shape.CircleShape),
                            )
                        }
                    }
                }
            }
        }

        SettingsSection(title = stringResource(R.string.display_mode)) {
            OptionRow(
                options = listOf(
                    stringResource(R.string.text_mode) to 0,
                    stringResource(R.string.page_mode) to 1,
                ),
                selected = settings.displayMode,
                onSelect = { value -> vm.setDisplayMode(value) },
            )
        }

        SettingsSection(title = stringResource(R.string.mushaf_style)) {
            OptionRow(
                options = listOf(
                    stringResource(R.string.mushaf_madinah) to 0,
                    stringResource(R.string.mushaf_tajweed) to 1,
                    stringResource(R.string.mushaf_madinah_hd) to 2,
                    stringResource(R.string.mushaf_ayat_hafs) to 3,
                    stringResource(R.string.mushaf_ayat_warsh) to 4,
                ),
                selected = settings.mushafStyle,
                onSelect = { value -> vm.setMushafStyle(value) },
            )
        }

        Spacer(Modifier.width(24.dp))
        Text(
            text = stringResource(R.string.about_text),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(48.dp))
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(8.dp))
        content()
    }
}

@Composable
private fun <T> OptionRow(
    options: List<Pair<String, T>>,
    selected: T,
    onSelect: (T) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        options.forEach { (label, value) ->
            val isSelected = value == selected
            TvCard(
                onClick = { onSelect(value) },
                backgroundColor = if (isSelected) MaterialTheme.colorScheme.primaryContainer
                else com.qurantv.app.ui.theme.SurfaceContainer,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
