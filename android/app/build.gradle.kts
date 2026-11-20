plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.safe.exam"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.safe.exam"
        minSdk = 26
        targetSdk = 34
        // Phien ban = file VERSION o thu muc goc du an, dang LON.NHO (vd 1.0, 1.1, 2.0 - xem CHANGELOG.md).
        // versionCode (Android dung de biet ban nao moi hon) suy ra tu phien ban: 1.1 -> 1001, 2.0 -> 2000
        val appVersion = rootProject.file("../VERSION").takeIf { it.exists() }?.readText()?.trim() ?: "1.0"
        val (major, minor) = appVersion.split(".").map { it.toIntOrNull() ?: 0 } + listOf(0, 0)
        versionName = appVersion
        versionCode = major * 1000 + minor

        // Dia chi trang dang nhap: dat safeExamUrl trong android/gradle.properties
        // (hoac build: gradlew assembleDebug -PsafeExamUrl=https://...)
        val examUrl = (project.findProperty("safeExamUrl") as String?) ?: "http://10.0.2.2:3000/index.html"
        buildConfigField("String", "EXAM_URL", "\"$examUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
}
