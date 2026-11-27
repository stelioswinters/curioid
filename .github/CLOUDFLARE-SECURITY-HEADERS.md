# CURIOID security headers on Cloudflare

CURIOID is published as a static GitHub Pages site. GitHub Pages does not read the repository's `_headers` file, so the file is retained as a reference but does not configure live HTTP response headers.

Apply the following at Cloudflare for `stelioswinters.com`.


## 0. Keep the HTML shell and service worker out of edge cache

Create a **Cache Rule** for CURIOID and place it above any broader rule that caches all HTML or static content.

Expression:

```
(http.host eq "stelioswinters.com" and starts_with(http.request.uri.path, "/curioid/") and (http.request.uri.path eq "/curioid/" or http.request.uri.path eq "/curioid/index.html" or ends_with(http.request.uri.path, ".html") or ends_with(http.request.uri.path, "/service-worker-current.js")))
```

Action: **Bypass cache**.

This prevents a cached homepage or standalone HTML document from remaining on an older release after GitHub Pages has deployed a new service worker. The worker also adds a release-specific navigation query and fetches navigations with `cache: no-store`, but the edge rule is still required where Cloudflare proxy caching is enabled.

## 1. Enable the managed security-header transform

In **Cloudflare Dashboard → stelioswinters.com → Rules → Transform Rules → Managed Transforms**, enable **Add security headers**.

This supplies `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN` (among other headers). It applies at the zone level, so review any existing site-wide policy first.

## 2. Add a scoped Response Header Transform Rule

Create **Rules → Transform Rules → Response Header Transform Rule**.

Expression:

```
(http.host eq "stelioswinters.com" and starts_with(http.request.uri.path, "/curioid/"))
```

Set these response headers:

| Header | Value |
|---|---|
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=()` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Strict-Transport-Security` | `max-age=31536000` |
| `Content-Security-Policy` | `frame-ancestors 'self'` |

Use **Set static** for each header so an existing conflicting value is replaced. Do not replace the site's full Content-Security-Policy here: the existing per-document meta policies are carefully configured and a second response policy should add only the framing restriction.

HSTS is appropriate only while the hostname is permanently HTTPS. This value intentionally omits `includeSubDomains` and `preload`.

## 3. Verify

After deploying, inspect response headers for:

- `https://stelioswinters.com/curioid/`
- `https://stelioswinters.com/curioid/chroma-loom.html`
- `https://stelioswinters.com/curioid/curioids.html`

Confirm the headers are present on both successful responses and error responses. Cloudflare's Rules → Overview simulator can verify that the expression matches the intended paths.

## Notes

- Cloudflare must proxy the DNS record for response transform rules to run.
- GitHub Pages deployment does not apply `_headers`.
- Do not add a blanket CSP or enable cross-origin isolation headers (COOP/COEP) without testing the standalone apps, workers, voice/audio, and embedded project windows.
