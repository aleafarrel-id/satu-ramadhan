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
-keep class com.saturamadhan.mobile.PrayerBootReceiver { *; }
-keep class com.saturamadhan.mobile.PrayerAlarmReceiver { *; }
-keep class com.saturamadhan.mobile.PrayerActionReceiver { *; }

# Keep the Foreground Service
-keep class com.saturamadhan.mobile.PrayerPlaybackService { *; }

# Keep the Capacitor plugin (called reflectively by Capacitor's bridge)
-keep class com.saturamadhan.mobile.PrayerServicePlugin { *; }

# Keep WorkManager workers (instantiated reflectively by WorkManager)
-keep class com.saturamadhan.mobile.AlarmRescheduleWorker { *; }

# Keep the Constants class (used by all components above)
-keep class com.saturamadhan.mobile.Constants { *; }

# Keep the MainActivity
-keep class com.saturamadhan.mobile.MainActivity { *; }

# ─── Murottal Background Playback ───────────────────────────────────────────
-keep class com.saturamadhan.mobile.MurottalPlaybackService { *; }
-keep class com.saturamadhan.mobile.MurottalServicePlugin { *; }
-keep class com.saturamadhan.mobile.MurottalActionReceiver { *; }

# ─── General AndroidX / WorkManager rules ───────────────────────────────────
# WorkManager's internal RescheduleReceiver and related classes must survive R8
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }

# ─── Cordova & Capacitor Bridge Rules ───────────────────────────────────────
# Cordova plugins do NOT supply consumer rules automatically. Since they are 
# instantiated via reflection by the Cordova plugin manager, they must be kept.
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin
-keep class cordova.plugins.** { *; }

# Safeguard Capacitor plugins and their methods from aggressive R8 stripping
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}

# ─── AndroidX Activity & Fragments (Used by Permission Requests) ────────────
# R8 sometimes strips ActivityResult contracts used by native permission dialogs
-keep class androidx.activity.result.** { *; }
-keep class androidx.fragment.app.** { *; }

# ─── Capgo Navigation Bar Plugin ────────────────────────────────────────────
# Keep navigation bar plugin classes to prevent R8 from stripping internal 
# components which may cause reflection failures in release builds.
-keep class ee.forgr.capacitor_navigation_bar.** { *; }

# ─── Capawesome App Review Plugin ───────────────────────────────────────────
# AppReview.java is the implementation class (not the Plugin class) and is
# NOT annotated with @CapacitorPlugin, so it is not covered by the annotation
# rule above. It is instantiated from AppReviewPlugin.load() which itself is
# called reflectively by the Capacitor bridge.
-keep class io.capawesome.capacitorjs.plugins.appreview.** { *; }

# ─── Capawesome App Update Plugin ───────────────────────────────────────────
# AppUpdatePlugin uses Google Play Core (app-update) which relies on internal
# reflection. Keep the entire package to prevent R8 from stripping or renaming
# listener classes and internal helper classes.
-keep class io.capawesome.capacitorjs.plugins.appupdate.** { *; }
