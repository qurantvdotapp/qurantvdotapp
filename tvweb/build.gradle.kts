// Android TV wrapper for the shared web port (Quran TV web app).
// A WebView that loads web/dist — one web codebase runs on Android TV,
// Tizen, and Vidaa. See PROMPT.md / web/ for the shared app.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.qurantv.tvweb"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.qurantv.tvweb"
        minSdk = 23
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Copy the built web app into the APK assets (web/dist must exist — built first).
val copyWebAssets = tasks.register<Copy>("copyWebAssets") {
    from(projectDir.resolve("../web/dist"))
    into(projectDir.resolve("src/main/assets/www"))
    include("index.html", "**/*")
    // dist is regenerable — never commit it into assets
    outputs.upToDateWhen { false }
}
tasks.named("preBuild").configure { dependsOn(copyWebAssets) }
