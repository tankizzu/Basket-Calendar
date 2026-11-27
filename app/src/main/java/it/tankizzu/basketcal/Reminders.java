package it.tankizzu.basketcal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** Programma i promemoria con AlarmManager e li conserva per il riavvio del telefono. */
public class Reminders {
    static final String ACTION = "it.tankizzu.basketcal.REMIND";

    static Intent baseIntent(Context c, String id) {
        return new Intent(c, AlarmReceiver.class)
                .setAction(ACTION)
                .setData(Uri.parse("basketcal://r/" + Uri.encode(id)));
    }

    /** Annulla i promemoria precedenti e programma quelli nuovi. Restituisce quanti ne ha programmati. */
    static synchronized int replaceAll(Context c, String json) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        try {
            JSONArray old = new JSONArray(Bridge.prefs(c).getString("reminders", "[]"));
            for (int i = 0; i < old.length(); i++) {
                String id = old.getJSONObject(i).getString("id");
                PendingIntent pi = PendingIntent.getBroadcast(c, id.hashCode(), baseIntent(c, id),
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            }
        } catch (Exception ignored) { }
        Bridge.prefs(c).edit().putString("reminders", json).apply();
        return scheduleStored(c);
    }

    /** Programma tutti i promemoria futuri salvati. */
    static int scheduleStored(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        long now = System.currentTimeMillis();
        int count = 0;
        try {
            JSONArray arr = new JSONArray(Bridge.prefs(c).getString("reminders", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject r = arr.getJSONObject(i);
                long at = r.getLong("at");
                if (at <= now) continue;
                String id = r.getString("id");
                Intent in = baseIntent(c, id)
                        .putExtra("id", id)
                        .putExtra("titolo", r.optString("titolo"))
                        .putExtra("testo", r.optString("testo"));
                PendingIntent pi = PendingIntent.getBroadcast(c, id.hashCode(), in,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                count++;
            }
        } catch (Exception ignored) { }
        return count;
    }
}
