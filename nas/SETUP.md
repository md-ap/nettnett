# NAS Webhook Sync Setup

Reemplaza el rclone bisync periódico con un webhook que se activa solo cuando hay uploads.

## 1. Crear el Cloudflare Tunnel

1. Ve a [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
2. Click "Create a tunnel" → selecciona "Cloudflared"
3. Dale un nombre como `nettnett-sync`
4. Copia el token del tunnel
5. En la config del tunnel, agrega un Public Hostname:
   - Subdomain: `sync` (o el que quieras)
   - Domain: tu dominio en Cloudflare
   - Service: `http://rclone-webhook:9222`
   - O si no tienes dominio, usa la URL que Cloudflare te da

## 2. Generar el webhook secret

```bash
openssl rand -hex 32
```

## 3. Configurar en el NAS

1. Copia esta carpeta `nas/` al NAS (por ejemplo a `/volume1/docker/rclone-webhook/`)
2. Asegúrate de que la carpeta `config/` tiene tu `rclone.conf` con la config de backblaze
3. Crea el archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
# Edita .env con tu token y secret
```

4. Levanta los containers:

```bash
docker-compose up -d
```

5. Verifica que funciona:

```bash
# Health check
curl https://TU-TUNNEL-URL/health

# Test sync (reemplaza con tu secret)
curl -X POST https://TU-TUNNEL-URL/sync \
  -H "Authorization: Bearer TU-SECRET"
```

## 4. Parar el rclone bisync viejo

```bash
docker stop rclone-backblaze-sync
docker rm rclone-backblaze-sync
```

## 5. Configurar en Vercel

Agrega estas variables de entorno en Vercel:

- `NAS_WEBHOOK_URL` = `https://TU-TUNNEL-URL/sync`
- `NAS_WEBHOOK_SECRET` = el mismo secret que pusiste en el NAS

## Cómo funciona

```
Upload en Vercel → B2 → POST /sync al NAS → rclone copy B2→NAS → archivos disponibles en AzuraCast
```

- `rclone copy` es unidireccional (B2 → NAS), usa menos API calls que `bisync`
- El sync solo se ejecuta cuando hay un upload real
- El webhook responde inmediatamente y el sync corre en background
- Logs en `config/sync.log`
