# NAS Setup - Named Tunnel con radionettnettstream.com

Un solo Cloudflare Named Tunnel expone AzuraCast y el webhook de rclone con URLs fijas.

## URLs fijas

| Subdominio | Servicio | Puerto |
|------------|----------|--------|
| `radio.radionettnettstream.com` | AzuraCast (streaming) | `azuracast:8080` |
| `sync.radionettnettstream.com` | rclone webhook (sync B2→NAS) | `rclone-backblaze-sync:9222` |

## 1. Crear el Named Tunnel en Cloudflare

1. Ve a [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
2. Click "Create a tunnel" → selecciona "Cloudflared"
3. Nombre: `nettnett-nas`
4. Copia el **token** del tunnel
5. Agrega 2 Public Hostnames:

   **Radio:**
   - Subdomain: `radio`
   - Domain: `radionettnettstream.com`
   - Type: HTTP
   - URL: `azuracast:8080`

   **Sync webhook:**
   - Subdomain: `sync`
   - Domain: `radionettnettstream.com`
   - Type: HTTP
   - URL: `rclone-backblaze-sync:9222`

Los registros DNS (CNAME) se crean automáticamente.

## 2. Generar el webhook secret

```bash
openssl rand -hex 32
```

## 3. Configurar en el NAS

1. Copia esta carpeta `nas/` al NAS (ej: `/volume1/docker/rclone-webhook/`)
2. Asegúrate de que `config/` tiene tu `rclone.conf` con la config de Backblaze
3. Crea el archivo `.env`:

```bash
cp .env.example .env
```

4. Edita `.env` con tus valores:
   - `WEBHOOK_SECRET` = el secret que generaste
   - `CLOUDFLARE_TUNNEL_TOKEN` = el token del paso 1

5. Levanta los containers:

```bash
docker-compose up -d
```

6. Verifica que funciona:

```bash
# Health check
curl https://sync.radionettnettstream.com/health

# Test sync
curl -X POST https://sync.radionettnettstream.com/sync \
  -H "Authorization: Bearer TU-SECRET"

# Radio
curl -I https://radio.radionettnettstream.com
```

## 4. Parar los quick tunnels viejos

```bash
docker stop cloudflare-tunnel cloudflare-tunnel-sync
docker rm cloudflare-tunnel cloudflare-tunnel-sync
```

## 5. Actualizar variables en Vercel

Cambia estas env vars en el dashboard de Vercel:

| Variable | Valor nuevo |
|----------|-------------|
| `NEXT_PUBLIC_AZURACAST_URL` | `https://radio.radionettnettstream.com` |
| `NAS_WEBHOOK_URL` | `https://sync.radionettnettstream.com/sync` |

**Re-deploy** después de cambiar las variables.

## Cómo funciona

```
Upload en Vercel → B2 → POST sync.radionettnettstream.com/sync → rclone copy B2→NAS → AzuraCast
```

- `rclone copy` es unidireccional (B2 → NAS)
- El sync solo se ejecuta cuando hay un upload real
- El webhook responde inmediatamente, sync corre en background
- Logs en `config/sync.log`

## Nota sobre AzuraCast

AzuraCast tiene su **propio docker-compose** separado (en `/volume1/docker/azuracast/`). El named tunnel se conecta a AzuraCast por la red Docker. Asegúrate de que ambos stacks comparten la misma red Docker o usa la IP del host:

Si AzuraCast está en una red Docker diferente, cambia el URL en Cloudflare de `azuracast:8080` a `host.docker.internal:8080` o la IP local del NAS `192.168.1.102:8080`.
