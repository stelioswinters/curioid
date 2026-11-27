# CURIOID release process

The only editable release version is the number at the very bottom of `index.html`:

```html
<small class="site-version">v1.356</small>
```

Change that one value when preparing a release, then run:

```sh
node scripts/refresh-release-integrity.cjs
```

The builder propagates the footer version to every HTML release marker, the
site runtime, the service worker and the lazy Health Check module. It also
refreshes the PWA project count, all script/style SHA-256 and SHA-384 values,
the service-worker offline asset manifest, and the runtime preload/execution
integrity pair. Do not edit generated release markers by hand.

The browser-quality GitHub Action runs the same builder, checks that a second
run is idempotent, executes the static audits and full Playwright browser
suite, then packages the verified deployable website as a ZIP artifact.
