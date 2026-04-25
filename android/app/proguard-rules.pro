# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─── Satu Ramadhan: Keep all native components ──────────────────────────────
# R8/ProGuard may strip or rename classes that are only referenced from
# AndroidManifest.xml (receivers, services, workers) because no Java code
# directly instantiates them. This causes BOOT_COMPLETED and alarm triggers
# to silently fail in release builds.

# Keep all BroadcastReceivers (PrayerBootReceiver, PrayerAlarmReceiver, PrayerActionReceiver)
-keep class com.saturamadhan.app.PrayerBootReceiver { *; }
-keep class com.saturamadhan.app.PrayerAlarmReceiver { *; }
-keep class com.saturamadhan.app.PrayerActionReceiver { *; }

# Keep the Foreground Service
-keep class com.saturamadhan.app.PrayerPlaybackService { *; }

# Keep the Capacitor plugin (called reflectively by Capacitor's bridge)
-keep class com.saturamadhan.app.PrayerServicePlugin { *; }

# Keep WorkManager workers (instantiated reflectively by WorkManager)
-keep class com.saturamadhan.app.AlarmRescheduleWorker { *; }

# Keep the Constants class (used by all components above)
-keep class com.saturamadhan.app.Constants { *; }

# Keep the MainActivity
-keep class com.saturamadhan.app.MainActivity { *; }

# ─── Murottal Background Playback ───────────────────────────────────────────
-keep class com.saturamadhan.app.MurottalPlaybackService { *; }
-keep class com.saturamadhan.app.MurottalServicePlugin { *; }
-keep class com.saturamadhan.app.MurottalActionReceiver { *; }

# ─── General AndroidX / WorkManager rules ───────────────────────────────────
# WorkManager's internal RescheduleReceiver and related classes must survive R8
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }
