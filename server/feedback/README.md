# Athena feedback inbox

GPL-2.0-only. Dependency-free Node.js 22+ service. User reports are anonymous;
reading, exporting, updating and deleting reports requires an existing administrator session.

The public configurator posts to `/studio/api/feedback`. The international site
posts to `https://kbd.cool/studio/api/feedback` with credentials omitted. Both sites
use one inbox, hosted in China at `https://kbd.cool/studio/inbox.html`.
Only the two configured origins can submit. Anonymous submissions do not authorize
any inbox reads. The admin page uses kbd.cool's existing admin login; this service
never stores administrator passwords or session tokens.

Run with a writable persistent `FEEDBACK_DATA_DIR`, `PORT` (8771), and
`FEEDBACK_AUTH_URL` (default `http://127.0.0.1:5174/api/admin/session`).
The authorizer expects `{ok:true,user:"..."}` from that trusted internal endpoint
and fails closed on missing cookies, timeouts or unsuccessful responses.
`FEEDBACK_ADMIN_ORIGIN` defaults to `https://kbd.cool`.
Expose only through a same-origin HTTPS reverse proxy. Set
`FEEDBACK_TRUST_PROXY=1` only behind a proxy that overwrites `X-Real-IP`.
Bind to loopback; do not expose port 8771 publicly.

Nginx location (alongside the existing `/studio/` static route):

```nginx
location ^~ /studio/api/feedback {
  client_max_body_size 5m;
  proxy_pass http://127.0.0.1:8771;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_read_timeout 35s;
}
```

Store reports outside the public web root. Each record is saved atomically with
mode 0600 and fsynced before acknowledging receipt. Use a persistent host volume;
back it up through the server's existing backup procedures. Public releases never
include real reports or screenshots. Caps: 512 MiB total, 5,000 reports,
10 submission attempts/IP/hour, 4.5 MB request, 3 screenshots <=1 MiB each after
client compression. At capacity new submissions fail visibly without deleting old
reports. Admins can delete reports from the inbox. Origin checking is not a bot
challenge; the rate and storage limits provide basic abuse protection.

Diagnostics stay in a bounded in-memory ring (100 events) until the user submits
with the diagnostics box checked. Allowed fields only: browser family/version,
OS family, UI language, viewport, site build version and named feature/connection/
transfer/error events with relative timestamps and optional source line. No raw
key events, typed text, credentials, URLs, key mappings, USB serials, image/GIF files,
console dumps or arbitrary exception messages are recorded. User-selected
screenshots and their report text are intentionally uploaded after submission;
images are rasterized client-side to remove file metadata. Screenshots are shown
only in the authenticated inbox.

For another deployment, replace the two origin defaults and frontend endpoint,
and implement `authorize(request)` using that site's trusted administrator auth.
Do not deploy the `.artifacts` test fixtures or test authorization callbacks.
