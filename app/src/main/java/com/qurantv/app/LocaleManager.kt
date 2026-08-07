package com.qurantv.app

import android.content.Context
import android.content.SharedPreferences
import android.content.res.Configuration
import java.util.Locale

/**
 * Runtime locale handling without AppCompat (PROMPT.md Part 10 — ar primary, en
 * secondary). The language is mirrored to SharedPreferences so it can be applied
 * synchronously in [MainActivity.attachBaseContext].
 */
object LocaleManager {

    private const val PREFS = "qurantv_prefs"
    private const val KEY_LANGUAGE = "language"
    const val DEFAULT_LANGUAGE = "ar"

    fun readLanguage(context: Context): String =
        prefs(context).getString(KEY_LANGUAGE, DEFAULT_LANGUAGE) ?: DEFAULT_LANGUAGE

    fun writeLanguage(context: Context, language: String) {
        prefs(context).edit().putString(KEY_LANGUAGE, language).apply()
    }

    fun wrap(base: Context, language: String): Context {
        val locale = Locale(language)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration)
        config.setLocale(locale)
        return base.createConfigurationContext(config)
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
