package com.qurantv.app

import android.app.Application
import com.qurantv.app.di.AppContainer

class QuranTvApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
