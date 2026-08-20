package com.qurantv.tvweb

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            // file:// pages must be allowed to load their own CSS/JS/fonts
            // (the built app lives under android_asset/www).
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "${userAgentString} QuranTV-Web; AndroidTV"
        }
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = WebViewClient()
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true

        // Keep the screen on during playback.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView.loadUrl("file:///android_asset/www/index.html")
        webView.requestFocus()
    }

    /** Forwards a synthetic DOM KeyboardEvent to the page; always consume. */
    private fun forwardToPage(key: String, keyCode: Int): Boolean {
        webView.evaluateJavascript(
            "window.dispatchEvent(new KeyboardEvent('keydown',{key:${jsStr(key)},keyCode:$keyCode,which:$keyCode,bubbles:true}));" +
                "window.dispatchEvent(new KeyboardEvent('keyup',{key:${jsStr(key)},keyCode:$keyCode,which:$keyCode,bubbles:true}));",
            null,
        )
        return true
    }

    private fun jsStr(s: String): String = "\"${s.replace("\"", "\\\"")}\""

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> return forwardToPage("ArrowUp", 38)
                KeyEvent.KEYCODE_DPAD_DOWN -> return forwardToPage("ArrowDown", 40)
                KeyEvent.KEYCODE_DPAD_LEFT -> return forwardToPage("ArrowLeft", 37)
                KeyEvent.KEYCODE_DPAD_RIGHT -> return forwardToPage("ArrowRight", 39)
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER -> return forwardToPage("Enter", 13)
                KeyEvent.KEYCODE_SPACE -> return forwardToPage(" ", 32)
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_MEDIA_PLAY,
                KeyEvent.KEYCODE_MEDIA_PAUSE -> return forwardToPage("MediaPlayPause", 415)
                KeyEvent.KEYCODE_MEDIA_NEXT -> return forwardToPage("MediaTrackNext", 417)
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> return forwardToPage("MediaTrackPrevious", 412)
                KeyEvent.KEYCODE_INFO -> return forwardToPage("Info", 10252)
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onBackPressed() {
        // Forward Back as Escape (the web app closes dialogs / navigates).
        // Long-press Back (system default) exits the Activity.
        forwardToPage("Escape", 10009)
    }

    override fun onDestroy() {
        runCatching { window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
        super.onDestroy()
    }
}
