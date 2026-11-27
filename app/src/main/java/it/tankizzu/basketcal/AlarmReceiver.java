package it.tankizzu.basketcal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String id = intent.getStringExtra("id");
        if (id == null) return;
        Notifier.show(c, id, intent.getStringExtra("titolo"), intent.getStringExtra("testo"));
    }
}
