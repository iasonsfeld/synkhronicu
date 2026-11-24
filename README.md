# sv

visueller synthesizer.

- `/` — galerie: nur ansicht, keine eingabe
- `/admin/` — steuerung, mit passwort

ohne verbundenen admin ist die galerie still oder generativ (F7 im admin).

## relais

`relais/` ist ein cloudflare worker. er verbindet admin und galerie über das netz.
die galerie hört nur zu; senden darf nur, wer das passwort kennt.
das passwort steht nie im repo, sondern als geheimer wert `PASSWORT` bei cloudflare.

einrichten über das cloudflare-dashboard:

1. workers & pages → erstellen → repository importieren → `synkron`
2. stammverzeichnis: `relais`
3. bereitstellen
4. einstellungen → variablen und geheimnisse → geheimnis `PASSWORT` anlegen
5. die adresse `https://synkhronicu.<name>.workers.dev` notieren

lokal testen: `cd relais && npm i && echo 'PASSWORT="probe"' > .dev.vars && npx wrangler dev`
