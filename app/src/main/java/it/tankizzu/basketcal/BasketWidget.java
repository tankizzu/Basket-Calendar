package it.tankizzu.basketcal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget della schermata Home con i prossimi tre impegni (dati preparati dall'app). */
public class BasketWidget extends AppWidgetProvider {
    static final int[] ROWS = {R.id.row1, R.id.row2, R.id.row3};
    static final int[] BARS = {R.id.bar1, R.id.bar2, R.id.bar3};
    static final int[] WHEN = {R.id.when1, R.id.when2, R.id.when3};
    static final int[] TITLE = {R.id.title1, R.id.title2, R.id.title3};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, BasketWidget.class));
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        int shown = 0;
        try {
            JSONArray arr = new JSONArray(Bridge.prefs(c).getString("widget", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length() && shown < 3; i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.getLong("at") < now - 30 * 60000L) continue;
                v.setViewVisibility(ROWS[shown], View.VISIBLE);
                v.setImageViewResource(BARS[shown], "LIONS".equals(o.optString("club"))
                        ? R.drawable.logo_lions : R.drawable.logo_bulldogs);
                String when = o.optString("giorno") + " · " + o.optString("ora");
                String sotto = o.optString("sotto");
                v.setTextViewText(WHEN[shown], sotto.isEmpty() ? when : when + " · " + sotto);
                v.setTextViewText(TITLE[shown], o.optString("titolo"));
                shown++;
            }
        } catch (Exception ignored) { }
        for (int i = shown; i < 3; i++) v.setViewVisibility(ROWS[i], View.GONE);
        v.setViewVisibility(R.id.empty, shown == 0 ? View.VISIBLE : View.GONE);
        return v;
    }
}
