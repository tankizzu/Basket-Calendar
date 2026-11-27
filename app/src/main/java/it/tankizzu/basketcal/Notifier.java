package it.tankizzu.basketcal;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

public class Notifier {
    static final String CHANNEL = "promemoria";

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Promemoria partite",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Avvisi di organizzazione e pre-gara");
            nm.createNotificationChannel(ch);
        }
    }

    static final String CH_LIVE = "partita";
    static final int LIVE_ID = 4242;

    static void showLive(Context c, String title, String text) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_LIVE) == null) {
            NotificationChannel ch = new NotificationChannel(CH_LIVE, "Partita in corso", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Punteggio della partita dal vivo");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CH_LIVE)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setContentIntent(pi)
                .build();
        try { nm.notify(LIVE_ID, n); } catch (SecurityException ignored) { }
    }

    static void clearLive(Context c) {
        c.getSystemService(NotificationManager.class).cancel(LIVE_ID);
    }

    static void show(Context c, String id, String title, String text) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        try {
            c.getSystemService(NotificationManager.class).notify(id.hashCode(), n);
        } catch (SecurityException ignored) {
            // permesso notifiche non concesso
        }
    }
}
