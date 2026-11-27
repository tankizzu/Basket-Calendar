package it.tankizzu.basketcal;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    static final int REQ_NOTIF = 1;
    static final int REQ_CAL = 2;
    static final int REQ_PHOTO = 3;

    private String pendingPhotoGame;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Notifier.ensureChannel(this);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(this), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (web != null) web.evaluateJavascript("window.onNativePermission && window.onNativePermission()", null);
    }

    static File photoDir(Activity a) {
        File d = new File(a.getFilesDir(), "referti");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    void pickPhoto(String gameId) {
        pendingPhotoGame = gameId;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(pick, "Foto del referto"), REQ_PHOTO);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_PHOTO || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final String game = pendingPhotoGame;
        final Uri uri = data.getData();
        new Thread(() -> {
            String name = "";
            try {
                String safe = game.replaceAll("[^A-Za-z0-9_-]", "_");
                name = safe + "-" + System.currentTimeMillis() + ".jpg";
                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(new File(photoDir(this), name))) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
            } catch (Exception e) { name = ""; }
            runJs("window.onPhotoPicked && window.onPhotoPicked(" + org.json.JSONObject.quote(game) + ","
                    + org.json.JSONObject.quote(name) + ")");
        }).start();
    }

    void runJs(String js) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
