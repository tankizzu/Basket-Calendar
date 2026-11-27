package it.tankizzu.basketcal;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

/** Metodi chiamati dalla pagina web tramite window.Android. */
public class Bridge {
    private final MainActivity activity;

    Bridge(MainActivity activity) { this.activity = activity; }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("basket", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public String getSettings() { return prefs(activity).getString("settings", ""); }

    @JavascriptInterface
    public void saveSettings(String json) { prefs(activity).edit().putString("settings", json).apply(); }

    @JavascriptInterface
    public int scheduleReminders(String json) { return Reminders.replaceAll(activity, json); }

    @JavascriptInterface
    public boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        activity.runOnUiThread(() -> activity.requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, MainActivity.REQ_NOTIF));
    }

    @JavascriptInterface
    public void testNotification() {
        Notifier.show(activity, "test", "Calendari Basket", "Le notifiche funzionano.");
    }

    @JavascriptInterface
    public boolean hasCalendarPermission() {
        return activity.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
                && activity.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public void requestCalendarPermission() {
        activity.runOnUiThread(() -> activity.requestPermissions(
                new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR},
                MainActivity.REQ_CAL));
    }

    @JavascriptInterface
    public String listCalendars() { return CalendarSync.listCalendars(activity); }

    @JavascriptInterface
    public String syncCalendar(String calendarId, String eventsJson) {
        return CalendarSync.sync(activity, calendarId, eventsJson);
    }

    @JavascriptInterface
    public String getLastSync() { return prefs(activity).getString("lastSync", ""); }
}
