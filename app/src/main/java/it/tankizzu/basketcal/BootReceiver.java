package it.tankizzu.basketcal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Dopo il riavvio o un aggiornamento dell'app riprogramma i promemoria salvati. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        Reminders.scheduleStored(c);
    }
}
