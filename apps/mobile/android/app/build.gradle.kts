plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Applied imperatively, not in the `plugins {}` block above, because it must
// only run once google-services.json actually exists — Google Sign-In isn't
// configured yet, and the build must keep working until it is.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "lk.tugo.mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true
    }

    defaultConfig {
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Two separate installable apps from one codebase — the rider app and the
    // driver app — distinguished by application id, name and icon. Dart-side
    // behaviour is picked by which entrypoint ran (lib/main.dart vs
    // lib/main_driver.dart), read via core/config/app_flavor.dart.
    flavorDimensions += "app"
    productFlavors {
        create("customer") {
            dimension = "app"
            applicationId = "lk.tugo.mobile"
            resValue("string", "app_name", "Tugo")
        }
        create("driver") {
            dimension = "app"
            applicationId = "lk.tugo.driver"
            resValue("string", "app_name", "Tugo Driver")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

// google-services.json only lists the customer app's package (lk.tugo.mobile) —
// the driver app has no Firebase/Google Sign-In client registered yet, which is
// unrelated to this split. Rather than block driver builds on that, skip the
// plugin's per-variant check for the driver flavor only.
tasks.configureEach {
    if (name.startsWith("process") && name.contains("Driver") && name.endsWith("GoogleServices")) {
        enabled = false
    }
}

flutter {
    source = "../.."
}
