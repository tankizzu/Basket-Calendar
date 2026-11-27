package it.tankizzu.basketcal;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/** Copia le partite nel calendario Google scelto: aggiunge, aggiorna e rimuove solo gli eventi creati dall'app. */
public class CalendarSync {

    static String listCalendars(Context c) {
        JSONArray out = new JSONArray();
        String[] proj = {Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME,
                Calendars.CALENDAR_ACCESS_LEVEL};
        try (Cursor cur = c.getContentResolver().query(Calendars.CONTENT_URI, proj, null, null,
                Calendars.ACCOUNT_NAME + " ASC")) {
            while (cur != null && cur.moveToNext()) {
                if (cur.getInt(3) < Calendars.CAL_ACCESS_CONTRIBUTOR) continue;
                JSONObject o = new JSONObject();
                o.put("id", cur.getLong(0));
                o.put("nome", cur.getString(1));
                o.put("account", cur.getString(2));
                out.put(o);
            }
        } catch (Exception ignored) { }
        return out.toString();
    }

    static Set<Long> existingEvents(ContentResolver cr, long calId) {
        Set<Long> ids = new HashSet<>();
        try (Cursor cur = cr.query(Events.CONTENT_URI, new String[]{Events._ID},
                Events.CALENDAR_ID + "=? AND " + Events.DELETED + "=0",
                new String[]{String.valueOf(calId)}, null)) {
            while (cur != null && cur.moveToNext()) ids.add(cur.getLong(0));
        }
        return ids;
    }

    static synchronized String sync(Context c, String calendarIdStr, String eventsJson) {
        JSONObject res = new JSONObject();
        try {
            long calId = Long.parseLong(calendarIdStr);
            ContentResolver cr = c.getContentResolver();
            JSONObject state = new JSONObject(Bridge.prefs(c).getString("calmap", "{}"));
            JSONObject map = state.optJSONObject("map");
            if (map == null) map = new JSONObject();
            int removed = 0, added = 0, updated = 0;

            // Calendario cambiato: tolgo gli eventi dal calendario precedente.
            long oldCal = state.optLong("calId", -1);
            if (oldCal != -1 && oldCal != calId) {
                Iterator<String> it = map.keys();
                while (it.hasNext()) {
                    long ev = map.getJSONObject(it.next()).getLong("ev");
                    removed += cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, ev), null, null);
                }
                map = new JSONObject();
            }

            Set<Long> existing = existingEvents(cr, calId);
            JSONArray events = new JSONArray(eventsJson);
            JSONObject newMap = new JSONObject();
            for (int i = 0; i < events.length(); i++) {
                JSONObject e = events.getJSONObject(i);
                String id = e.getString("id");
                String hash = String.valueOf((e.getString("titolo") + "|" + e.optString("luogo") + "|"
                        + e.optString("descrizione") + "|" + e.getLong("inizio") + "|" + e.getLong("fine")).hashCode());
                ContentValues v = new ContentValues();
                v.put(Events.CALENDAR_ID, calId);
                v.put(Events.TITLE, e.getString("titolo"));
                v.put(Events.EVENT_LOCATION, e.optString("luogo"));
                v.put(Events.DESCRIPTION, e.optString("descrizione"));
                v.put(Events.DTSTART, e.getLong("inizio"));
                v.put(Events.DTEND, e.getLong("fine"));
                v.put(Events.EVENT_TIMEZONE, "Europe/Rome");
                v.put(Events.HAS_ALARM, 0);

                JSONObject prev = map.optJSONObject(id);
                long ev = -1;
                if (prev != null && existing.contains(prev.getLong("ev"))) {
                    ev = prev.getLong("ev");
                    if (!hash.equals(prev.optString("h"))) {
                        cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, ev), v, null, null);
                        updated++;
                    }
                } else {
                    Uri u = cr.insert(Events.CONTENT_URI, v);
                    if (u != null) { ev = ContentUris.parseId(u); added++; }
                }
                if (ev != -1) newMap.put(id, new JSONObject().put("ev", ev).put("h", hash));
            }

            // Partite non più richieste (squadra deselezionata o gara annullata).
            Iterator<String> it = map.keys();
            while (it.hasNext()) {
                String id = it.next();
                if (newMap.has(id)) continue;
                long ev = map.getJSONObject(id).getLong("ev");
                if (existing.contains(ev)) {
                    removed += cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, ev), null, null);
                }
            }

            state.put("calId", calId);
            state.put("map", newMap);
            String when = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).format(new Date());
            String msg = "Ultima sincronizzazione " + when + ": " + newMap.length() + " partite nel calendario ("
                    + added + " aggiunte, " + updated + " aggiornate, " + removed + " rimosse).";
            Bridge.prefs(c).edit().putString("calmap", state.toString()).putString("lastSync", msg).apply();
            res.put("aggiunti", added).put("aggiornati", updated).put("rimossi", removed).put("messaggio", msg);
        } catch (SecurityException se) {
            try { res.put("errore", "permesso calendario mancante"); } catch (Exception ignored) { }
        } catch (Exception ex) {
            try { res.put("errore", String.valueOf(ex.getMessage())); } catch (Exception ignored) { }
        }
        return res.toString();
    }
}
