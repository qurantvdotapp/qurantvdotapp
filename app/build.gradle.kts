import java.net.HttpURLConnection
import java.net.URL
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.qurantv.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.qurantv.app"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.tv.foundation)
    implementation(libs.androidx.tv.material)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.common)
    implementation(libs.media3.session)
    implementation(libs.media3.datasource.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.coil.compose)
    implementation(libs.coil.svg)
    implementation(libs.androidsvg)
    testImplementation(libs.junit)
}

/**
 * Bundles the authentic Tanzil Uthmani Quran text as a build-time asset.
 *
 * The file is committed to the repo (app/src/main/assets/quran/quran-uthmani.txt) so
 * builds work offline. If it is ever missing, this task re-downloads it from Tanzil
 * (CC BY-NC-ND licensed text — attribution shown in the app's About/Settings screen).
 */
val downloadTanzilText by tasks.registering {
    val outFile = layout.projectDirectory.file("src/main/assets/quran/quran-uthmani.txt")
    outputs.file(outFile)
    doLast {
        val f = outFile.asFile
        if (f.exists() && f.length() > 1_000_000) {
            logger.lifecycle("Tanzil text already present, skipping download: ${f.name}")
            return@doLast
        }
        f.parentFile.mkdirs()
        logger.lifecycle("Downloading Tanzil Uthmani text from tanzil.net ...")
        val conn = URL("https://tanzil.net/pub/download/v1.0/download.php")
            .openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 30_000
        conn.readTimeout = 120_000
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        val body = "quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&rub=true&alef=true"
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        if (code != 200) throw GradleException("Tanzil download failed with HTTP $code")
        conn.inputStream.use { input -> f.outputStream().use { input.copyTo(it) } }
        if (f.length() < 1_000_000) throw GradleException("Tanzil download produced an unexpected file")
    }
}

tasks.named("preBuild") {
    dependsOn(downloadTanzilText)
}
