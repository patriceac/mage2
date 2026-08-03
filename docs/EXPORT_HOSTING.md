# Hosting a MAGE2 runtime export

The editor's **Export Runtime** action creates a static site in the project's `build` folder. The supported deployment unit is the complete contents of that folder.

## Supported hosts

Any static HTTPS host is supported when it preserves the exported paths and serves ordinary static files. Examples include Netlify, Cloudflare Pages, Vercel static hosting, GitHub Pages, object storage behind a CDN, nginx, and Apache.

Upload the contents of `build`, with `index.html` at the public root. MAGE2 does not require a server-side runtime, database, or API.

Opening `index.html` directly with `file://` is not supported. Browser fetch and media rules differ for local files; use a local HTTP server for previews or open the export through the editor.

## Required host behavior

- Use HTTPS for public deployments.
- Preserve file names, letter case, and the `assets`, `content`, and `media` directory structure.
- Serve JavaScript, CSS, JSON, images, audio, and video with correct MIME types.
- Support byte-range requests for video and audio so seeking works reliably.
- Serve unknown asset or content paths as `404`; do not rewrite every request to `index.html`.
- Do not inject third-party scripts into the export. If analytics is required, review and deliberately extend the site's CSP.
- Keep `index.html`, `build-manifest.json`, validation data, and project content revalidatable. Hashed application bundles and immutable media may use long-lived caching.

The export uses relative URLs, so it can be hosted at a domain root or a subdirectory as long as the full exported directory stays together.

## Recommended security headers

Configure these as HTTP response headers at the host. Adjust `frame-ancestors` only if embedding the game is an explicit requirement.

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

When the host supports it, add HSTS only after HTTPS and subdomain coverage have been validated.

## Deployment verification

After deployment:

1. Load the public HTTPS URL in a clean browser profile.
2. Confirm the opening scene renders and its audio/video can seek.
3. Confirm `content/project-content.json` and referenced media return `200`, not the HTML fallback.
4. Confirm the browser console has no CSP, MIME, mixed-content, or CORS errors.
5. Exercise at least one scene transition, dialogue or inventory action, and save/reload flow.
6. Re-run the check after a cache purge or from a second device.

Runtime exports contain the authored project content and media needed to play the game. Do not place credentials, private source documents, or unreleased personal data in project strings or assets intended for public hosting.
