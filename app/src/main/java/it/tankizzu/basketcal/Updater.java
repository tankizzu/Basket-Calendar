package it.tankizzu.basketcal;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Scarica il nuovo APK dalla Release di GitHub e lo installa con PackageInstaller.
 * Da Android 12, quando l'app aggiorna sé stessa, l'installazione avviene senza conferma
 * (serve solo il permesso "Installa app sconosciute" concesso una volta).
 */
public class Updater {
    interface Progress { void update(String stato, int percento); }

    static volatile boolean running = false;

    static void downloadAndInstall(Context c, String apkUrl, Progress p) {
        if (running) return;
        running = true;
        new Thread(() -> {
            File f = new File(c.getCacheDir(), "aggiornamento.apk");
            try {
                p.update("scarico", 0);
                HttpURLConnection con = (HttpURLConnection) new URL(apkUrl).openConnection();
                con.setInstanceFollowRedirects(true);
                con.setConnectTimeout(15000);
                con.setReadTimeout(60000);
                con.setRequestProperty("User-Agent", "CalendariBasket");
                int code = con.getResponseCode();
                // GitHub reindirizza al file vero: segue i redirect anche tra host diversi
                int hops = 0;
                while ((code == 301 || code == 302 || code == 303 || code == 307 || code == 308) && hops++ < 5) {
                    String loc = con.getHeaderField("Location");
                    con.disconnect();
                    con = (HttpURLConnection) new URL(loc).openConnection();
                    con.setConnectTimeout(15000);
                    con.setReadTimeout(60000);
                    code = con.getResponseCode();
                }
                if (code != 200) throw new Exception("download HTTP " + code);
                long total = con.getContentLengthLong();
                try (InputStream in = con.getInputStream(); OutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        int pc = total > 0 ? (int) (done * 100 / total) : 0;
                        if (pc != last) { last = pc; p.update("scarico", pc); }
                    }
                }
                con.disconnect();

                p.update("installo", 100);
                PackageInstaller pi = c.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                        PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(c.getPackageName());
                if (Build.VERSION.SDK_INT >= 31) {
                    params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                }
                int id = pi.createSession(params);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("app.apk", 0, f.length())) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        s.fsync(out);
                    }
                    Intent cb = new Intent(c, UpdateReceiver.class).setAction("it.tankizzu.basketcal.INSTALL_RESULT");
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent pend = PendingIntent.getBroadcast(c, id, cb, flags);
                    s.commit(pend.getIntentSender());
                }
            } catch (Exception e) {
                p.update("errore: " + e.getMessage(), 0);
            } finally {
                running = false;
            }
        }).start();
    }
}
