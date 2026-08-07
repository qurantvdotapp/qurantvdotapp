package com.qurantv.app.data.api

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

class ApiException(message: String, cause: Throwable? = null) : IOException(message, cause)

/** Thin OkHttp wrapper — all calls are executed on IO dispatchers. */
class ApiClient(private val client: OkHttpClient) {

    suspend fun getText(url: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .header("Accept", "application/json, text/plain, */*")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw ApiException("HTTP ${response.code} for $url")
            }
            response.body?.string() ?: throw ApiException("Empty body for $url")
        }
    }

    companion object {
        const val USER_AGENT = "QuranTv/1.0 (Android TV; mp3qurantv; +https://github.com)"
    }
}
