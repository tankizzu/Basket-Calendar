# Calendari Basket 2026/27

App Android personale con i calendari Bulldogs (U15, Aquilotti, Esordienti Bronze) e LIONS (Senior, U9, U12, U10, U14, U17).

- Viste cronologiche filtrabili per squadra, incroci nella stessa giornata (Bulldogs e LIONS separati, più i tuoi impegni).
- Promemoria sul telefono: organizzazione 10-15 giorni prima e avviso pre-gara, squadra per squadra.
- Sincronizzazione con un calendario Google scelto (es. "Basket").

## Scaricare l'APK
Ogni push su `main` compila l'app su GitHub Actions e pubblica l'APK nella pagina **Releases**.

## Aggiornare le partite
I dati sono in `app/src/main/assets/www/data.js`.

## Aggiornamenti
- **Partite:** l'app all'apertura scarica `data.js` da `main`. Se il campo `rev` è più alto di quello che ha, aggiorna le gare senza reinstallare. Ogni modifica ai dati deve aumentare `rev`.
- **App:** l'app controlla l'ultima Release e, se c'è una versione nuova, mostra un avviso con il tasto per scaricarla.
