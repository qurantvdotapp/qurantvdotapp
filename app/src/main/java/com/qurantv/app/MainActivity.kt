package com.qurantv.app

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.qurantv.app.ui.QuranTvRoot

class MainActivity : ComponentActivity() {

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase, LocaleManager.readLanguage(newBase)))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appContainer = (application as QuranTvApp).container
        setContent {
            QuranTvRoot(
                container = appContainer,
                onExit = { finish() },
                onRecreateForLanguage = { recreate() },
            )
        }
    }
}
