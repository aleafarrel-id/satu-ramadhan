package com.saturamadhan.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor plugin bridge between the JS Murottal engine and the
 * native MurottalPlaybackService foreground service.
 *
 * Provides methods for controlling playback and receiving state updates
 * from the native layer via Capacitor's notifyListeners() mechanism.
 *
 * Completely independent from PrayerServicePlugin.
 */
@CapacitorPlugin(name = "MurottalService")
public class MurottalServicePlugin extends Plugin {

    private static final String TAG = "MurottalServicePlugin";

    /**
     * Receives state-changed broadcasts from MurottalPlaybackService
     * and forwards them to the JS layer via notifyListeners().
     */
    private final BroadcastReceiver stateChangedReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null) return;

            JSObject data = new JSObject();
            data.put("surahIndex", intent.getIntExtra(Constants.EXTRA_MUROTTAL_SURAH_INDEX, 0));
            data.put("surahName", intent.getStringExtra(Constants.EXTRA_MUROTTAL_SURAH_NAME));
            data.put("ayahNumber", intent.getIntExtra(Constants.EXTRA_MUROTTAL_AYAH_NUMBER, 0));
            data.put("totalAyahs", intent.getIntExtra(Constants.EXTRA_MUROTTAL_TOTAL_AYAHS, 0));
            data.put("isPlaying", intent.getBooleanExtra(Constants.EXTRA_MUROTTAL_IS_PLAYING, false));
            data.put("isPaused", intent.getBooleanExtra(Constants.EXTRA_MUROTTAL_IS_PAUSED, false));
            data.put("mode", intent.getStringExtra(Constants.EXTRA_MUROTTAL_MODE));

            Log.d(TAG, "State changed → notifying JS: ayah=" + data.optInt("ayahNumber"));
            notifyListeners("onMurottalStateChanged", data);
        }
    };

    /**
     * Receives stop broadcasts when the service is destroyed.
     */
    private final BroadcastReceiver stoppedReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "Murottal stopped → notifying JS");
            notifyListeners("onMurottalStopped", new JSObject());
        }
    };

    @Override
    public void load() {
        super.load();

        // Register state-changed receiver
        IntentFilter stateFilter = new IntentFilter(Constants.ACTION_MUROTTAL_STATE_CHANGED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(stateChangedReceiver, stateFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(stateChangedReceiver, stateFilter);
        }

        // Register stopped receiver
        IntentFilter stoppedFilter = new IntentFilter(Constants.ACTION_MUROTTAL_STOPPED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(stoppedReceiver, stoppedFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(stoppedReceiver, stoppedFilter);
        }

        Log.d(TAG, "Murottal receivers registered");
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(stateChangedReceiver);
            getContext().unregisterReceiver(stoppedReceiver);
            Log.d(TAG, "Murottal receivers unregistered");
        } catch (Exception e) {
            Log.w(TAG, "Error unregistering receivers: " + e.getMessage());
        }
        super.handleOnDestroy();
    }

    // ── Playback Control Methods ─────────────────────────────────────

    /**
     * Start playback with a full playlist.
     *
     * Expected call data:
     *   - playlist: JSON string array of audio URIs
     *   - surahIndex: int
     *   - surahName: string
     *   - totalAyahs: int
     *   - startAyah: int (1-based)
     *   - mode: "sequential" | "single"
     *   - systemStrings: { playing, ayah, stop, pause, resume, next, prev, channelName, channelDesc }
     */
    @PluginMethod()
    public void play(PluginCall call) {
        String playlistJson = call.getString("playlist", "[]");
        int surahIndex = call.getInt("surahIndex", 0);
        String surahName = call.getString("surahName", "");
        int totalAyahs = call.getInt("totalAyahs", 0);
        int startAyah = call.getInt("startAyah", 1);
        String mode = call.getString("mode", "sequential");

        // Save i18n strings to SharedPreferences for the service
        JSObject systemStrings = call.getObject("systemStrings", null);
        if (systemStrings != null) {
            saveSystemStrings(systemStrings);
        }

        Context context = getContext();
        Intent intent = new Intent(context, MurottalPlaybackService.class);
        intent.setAction(Constants.ACTION_MUROTTAL_PLAY);
        intent.putExtra(Constants.EXTRA_MUROTTAL_PLAYLIST, playlistJson);
        intent.putExtra(Constants.EXTRA_MUROTTAL_SURAH_INDEX, surahIndex);
        intent.putExtra(Constants.EXTRA_MUROTTAL_SURAH_NAME, surahName);
        intent.putExtra(Constants.EXTRA_MUROTTAL_TOTAL_AYAHS, totalAyahs);
        intent.putExtra(Constants.EXTRA_MUROTTAL_START_AYAH, startAyah);
        intent.putExtra(Constants.EXTRA_MUROTTAL_MODE, mode);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }

        Log.d(TAG, "Play command sent: surah=" + surahIndex + " startAyah=" + startAyah + " mode=" + mode);
        call.resolve();
    }

    @PluginMethod()
    public void pause(PluginCall call) {
        sendServiceAction(Constants.ACTION_MUROTTAL_PAUSE);
        call.resolve();
    }

    @PluginMethod()
    public void resume(PluginCall call) {
        sendServiceAction(Constants.ACTION_MUROTTAL_RESUME);
        call.resolve();
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        sendServiceAction(Constants.ACTION_MUROTTAL_STOP);
        call.resolve();
    }

    @PluginMethod()
    public void next(PluginCall call) {
        sendServiceAction(Constants.ACTION_MUROTTAL_NEXT);
        call.resolve();
    }

    @PluginMethod()
    public void prev(PluginCall call) {
        sendServiceAction(Constants.ACTION_MUROTTAL_PREV);
        call.resolve();
    }

    /**
     * Returns the current playback state from the static variables
     * in MurottalPlaybackService.
     */
    @PluginMethod()
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("isPlaying", MurottalPlaybackService.isCurrentlyPlaying());
        result.put("isPaused", MurottalPlaybackService.isCurrentlyPaused());
        result.put("surahIndex", MurottalPlaybackService.getCurrentSurahIndex());
        result.put("surahName", MurottalPlaybackService.getCurrentSurahName());
        result.put("ayahNumber", MurottalPlaybackService.getCurrentAyahNumber());
        result.put("totalAyahs", MurottalPlaybackService.getCurrentTotalAyahs());
        result.put("mode", MurottalPlaybackService.getCurrentPlaybackMode());
        call.resolve(result);
    }

    // ── Internal Helpers ─────────────────────────────────────────────

    private void sendServiceAction(String action) {
        Context context = getContext();
        Intent intent = new Intent(context, MurottalPlaybackService.class);
        intent.setAction(action);
        context.startService(intent);
    }

    /**
     * Saves i18n system strings to SharedPreferences.
     * MurottalPlaybackService reads these when building notifications.
     * Pattern follows PrayerServicePlugin.saveSystemStringsToStorage().
     */
    private void saveSystemStrings(JSObject strings) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(Constants.PREF_MUROTTAL, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();

        if (strings.has("playing")) editor.putString("text_playing", strings.getString("playing"));
        if (strings.has("ayah")) editor.putString("text_ayah", strings.getString("ayah"));
        if (strings.has("stop")) editor.putString("text_stop", strings.getString("stop"));
        if (strings.has("pause")) editor.putString("text_pause", strings.getString("pause"));
        if (strings.has("resume")) editor.putString("text_resume", strings.getString("resume"));
        if (strings.has("next")) editor.putString("text_next", strings.getString("next"));
        if (strings.has("prev")) editor.putString("text_prev", strings.getString("prev"));
        if (strings.has("channelName")) editor.putString("text_channel_name", strings.getString("channelName"));
        if (strings.has("channelDesc")) editor.putString("text_channel_desc", strings.getString("channelDesc"));

        editor.apply();
        Log.d(TAG, "System strings saved to SharedPreferences");
    }
}
