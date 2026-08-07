package com.qurantv.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qurantv.app.data.repo.AppSettings
import com.qurantv.app.data.repo.SessionRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val sessions: SessionRepository,
) : ViewModel() {

    val settings: StateFlow<AppSettings> = sessions.settings.stateIn(
        viewModelScope,
        SharingStarted.Eagerly,
        AppSettings(),
    )

    fun setLanguage(language: String) {
        viewModelScope.launch { sessions.setLanguage(language) }
    }

    fun setDefaultSpeed(speed: Float) {
        viewModelScope.launch { sessions.setDefaultSpeed(speed) }
    }

    fun setFontSize(index: Int) {
        viewModelScope.launch { sessions.setFontSize(index) }
    }

    fun setHighlightColor(index: Int) {
        viewModelScope.launch { sessions.setHighlightColor(index) }
    }

    fun setDisplayMode(mode: Int) {
        viewModelScope.launch { sessions.setDisplayMode(mode) }
    }

    fun setMushafStyle(style: Int) {
        viewModelScope.launch { sessions.setMushafStyle(style) }
    }

    fun setAyahOffset(offset: Int) {
        viewModelScope.launch { sessions.setAyahOffset(offset) }
    }
}
