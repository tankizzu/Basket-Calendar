package it.tankizzu.basketcal;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Legge la foto di un referto con l'API gratuita di Mistral e restituisce punteggi e parziali in JSON. */
public class RefertoAI {
    static final String URL_API = "https://api.mistral.ai/v1/chat/completions";
    static final String[] MODELS = {"mistral-medium-latest", "mistral-small-latest"};

    static final String PROMPT =
            "Questa è la foto di un referto ufficiale di una partita di basket giovanile italiana, compilato a mano. "
            + "Leggi SOLO questi dati: nomi della Squadra A e della Squadra B (intestazione in alto), numero gara, data, "
            + "il riquadro 'RISULTATI PARZIALI' (1°, 2°, 3°, 4° periodo e supplementari, ciascuno con punti A e B) "
            + "e il riquadro 'RISULTATO FINALE'. Non leggere i nomi dei giocatori. "
            + "Rispondi solo con JSON: {\"squadraA\":\"\",\"squadraB\":\"\",\"gara\":\"\",\"data\":\"\","
            + "\"finaleA\":0,\"finaleB\":0,\"parziali\":[[0,0]],\"dubbi\":\"\"}. "
            + "Nei parziali metti solo i periodi compilati, nell'ordine. In 'dubbi' scrivi le cifre poco leggibili. "
            + "Se un valore non si legge usa null.";

    static String encodeImage(File f) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getAbsolutePath(), o);
        int max = Math.max(o.outWidth, o.outHeight);
        int sample = 1;
        while (max / (sample * 2) >= 1600) sample *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath(), o);
        if (b == null) throw new Exception("immagine non leggibile");
        int m = Math.max(b.getWidth(), b.getHeight());
        if (m > 1800) {
            float k = 1800f / m;
            b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * k), Math.round(b.getHeight() * k), true);
        }
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 85, bo);
        return Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    static String call(String key, String model, String b64) throws Exception {
        JSONObject img = new JSONObject().put("type", "image_url")
                .put("image_url", "data:image/jpeg;base64," + b64);
        JSONObject txt = new JSONObject().put("type", "text").put("text", PROMPT);
        JSONObject msg = new JSONObject().put("role", "user").put("content", new JSONArray().put(txt).put(img));
        JSONObject body = new JSONObject().put("model", model).put("temperature", 0)
                .put("response_format", new JSONObject().put("type", "json_object"))
                .put("messages", new JSONArray().put(msg));
        HttpURLConnection con = (HttpURLConnection) new URL(URL_API).openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setConnectTimeout(15000);
        con.setReadTimeout(90000);
        con.setRequestProperty("Content-Type", "application/json");
        con.setRequestProperty("Authorization", "Bearer " + key);
        try (OutputStream out = con.getOutputStream()) { out.write(body.toString().getBytes("UTF-8")); }
        int code = con.getResponseCode();
        InputStream in = code < 400 ? con.getInputStream() : con.getErrorStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        if (in != null) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
        }
        String resp = bo.toString("UTF-8");
        con.disconnect();
        if (code >= 400) throw new Exception("HTTP " + code + ": " + resp);
        return new JSONObject(resp).getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content");
    }

    /** Restituisce {ok:true, dati:{...}} oppure {ok:false, errore:"..."}. */
    static String analyze(Context c, File photo, String key) {
        JSONObject res = new JSONObject();
        try {
            String b64 = encodeImage(photo);
            Exception last = null;
            for (String model : MODELS) {
                try {
                    String content = call(key, model, b64).trim();
                    int a = content.indexOf('{'), z = content.lastIndexOf('}');
                    JSONObject dati = new JSONObject(content.substring(a, z + 1));
                    return res.put("ok", true).put("modello", model).put("dati", dati).toString();
                } catch (Exception e) {
                    last = e;
                    String m = String.valueOf(e.getMessage());
                    if (m.startsWith("HTTP 401")) break; // chiave errata: inutile riprovare
                }
            }
            throw last;
        } catch (Exception e) {
            try {
                String m = String.valueOf(e.getMessage());
                if (m.startsWith("HTTP 401")) m = "chiave API non valida";
                else if (m.startsWith("HTTP 429")) m = "limite del piano gratuito raggiunto, riprova tra poco";
                else if (m.length() > 200) m = m.substring(0, 200);
                res.put("ok", false).put("errore", m);
            } catch (Exception ignored) { }
        }
        return res.toString();
    }
}
