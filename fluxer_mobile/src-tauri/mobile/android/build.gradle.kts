plugins {
	id("com.android.library")
	id("org.jetbrains.kotlin.android")
}

android {
	namespace = "ru.rdchat.mobile"
	compileSdk = 36

	defaultConfig {
		minSdk = 24
		consumerProguardFiles("proguard-rules.pro")
	}

	buildTypes {
		release {
			isMinifyEnabled = false
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

	buildFeatures {
		buildConfig = true
	}
}

dependencies {
	implementation("androidx.appcompat:appcompat:1.6.1")
	implementation("androidx.core:core-ktx:1.13.1")
	implementation("androidx.core:core:1.13.1")
	implementation("com.fasterxml.jackson.core:jackson-databind:2.15.3")
	implementation(project(":tauri-android"))
}
