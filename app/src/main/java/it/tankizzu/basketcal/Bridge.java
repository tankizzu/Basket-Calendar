package it.tankizzu.basketcal;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
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
    public String getStore(String key) { return prefs(activity).getString("store_" + key, ""); }

    @JavascriptInterface
    public void setStore(String key, String json) { prefs(activity).edit().putString("store_" + key, json).apply(); }

    @JavascriptInterface
    public void openUrl(String url) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) { }
        });
    }

    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public int getVersionCode() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionCode;
        } catch (Exception e) { return 0; }
    }

    /** Scarica un testo in background e lo restituisce a window.__fetchCb(id, ok, testo). */
    @JavascriptInterface
    public void fetchAsync(String url, String id) {
        if (url == null || !url.startsWith("https://")) return;
        new Thread(() -> {
            boolean ok = false;
            String text = "";
            try {
                java.net.HttpURLConnection con = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                con.setConnectTimeout(8000);
                con.setReadTimeout(15000);
                con.setRequestProperty("User-Agent", "CalendariBasket");
                con.setRequestProperty("Cache-Control", "no-cache");
                int code = con.getResponseCode();
                if (code == 200) {
                    try (java.io.InputStream in = con.getInputStream()) {
                        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        text = bo.toString("UTF-8");
                        ok = true;
                    }
                }
                con.disconnect();
            } catch (Exception ignored) { }
            activity.runJs("window.__fetchCb && window.__fetchCb(" + org.json.JSONObject.quote(id) + "," + ok + ","
                    + org.json.JSONObject.quote(text) + ")");
        }).start();
    }

    @JavascriptInterface
    public void share(String text) {
        activity.runOnUiThread(() -> {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(send, "Condividi"));
        });
    }

    @JavascriptInterface
    public void copy(String text) {
        activity.runOnUiThread(() -> {
            android.content.ClipboardManager cm = activity.getSystemService(android.content.ClipboardManager.class);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("Calendari Basket", text));
        });
    }

    @JavascriptInterface
    public void pickPhoto(String gameId) { activity.runOnUiThread(() -> activity.pickPhoto(gameId)); }

    @JavascriptInterface
    public String photoUrl(String name) {
        if (name == null || name.contains("/")) return "";
        return "file://" + new java.io.File(MainActivity.photoDir(activity), name).getAbsolutePath();
    }

    @JavascriptInterface
    public void deletePhoto(String name) {
        if (name == null || name.contains("/")) return;
        new java.io.File(MainActivity.photoDir(activity), name).delete();
    }

    @JavascriptInterface
    public void setWidget(String json) {
        prefs(activity).edit().putString("widget", json).apply();
        BasketWidget.refresh(activity);
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        try {
            android.os.Vibrator v = activity.getSystemService(android.os.Vibrator.class);
            if (v != null && v.hasVibrator()) {
                v.vibrate(android.os.VibrationEffect.createOneShot(Math.max(5, Math.min(ms, 80)),
                        android.os.VibrationEffect.DEFAULT_AMPLITUDE));
            }
        } catch (Exception ignored) { }
    }

    /** Salva la grafica (PNG in base64) e apre la condivisione di Android. */
    @JavascriptInterface
    public void shareImage(String base64, String name) {
        new Thread(() -> {
            try {
                String safe = (name == null ? "grafica.png" : name).replaceAll("[^A-Za-z0-9._-]", "_");
                java.io.File f = new java.io.File(ImageProvider.dir(activity), safe);
                byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { out.write(bytes); }
                Uri uri = Uri.parse("content://" + ImageProvider.AUTH + "/" + safe);
                Intent send = new Intent(Intent.ACTION_SEND).setType("image/png")
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(android.content.ClipData.newRawUri("", uri));
                activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, "Condividi grafica")));
            } catch (Exception ignored) { }
        }).start();
    }

    static final String[] ICONS = {"ball", "bulldogs", "lions"};
    static final String[] ALIASES = {".IconBall", ".IconBulldogs", ".IconLions"};

    @JavascriptInterface
    public String getIcon() {
        android.content.pm.PackageManager pm = activity.getPackageManager();
        for (int i = 1; i < ALIASES.length; i++) {
            android.content.ComponentName cn = new android.content.ComponentName(activity, MainActivity.class.getPackage().getName() + ALIASES[i]);
            if (pm.getComponentEnabledSetting(cn) == android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return ICONS[i];
        }
        return "ball";
    }

    @JavascriptInterface
    public void setIcon(String icon) {
        android.content.pm.PackageManager pm = activity.getPackageManager();
        for (int i = 0; i < ALIASES.length; i++) {
            android.content.ComponentName cn = new android.content.ComponentName(activity, MainActivity.class.getPackage().getName() + ALIASES[i]);
            int state = ICONS[i].equals(icon) ? android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    : android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(cn, state, android.content.pm.PackageManager.DONT_KILL_APP);
        }
    }

    @JavascriptInterface
    public String getLastSync() { return prefs(activity).getString("lastSync", ""); }
}
