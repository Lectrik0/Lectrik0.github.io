# lectrik0.github.io

Personal site of **Ali Ahmed**, a cybersecurity student building toward cloud security.
Live at https://lectrik0.github.io

It's a static site with no backend, no build step, no third-party scripts and no tracking.

## Security

Even a static site can be attacked through XSS, malicious links or third-party scripts. This one is hardened like this:

| Control | How it's done here |
|---|---|
| Content Security Policy | `default-src 'none'`. Scripts, styles, fonts and images load only from this site. No inline scripts, no `eval`, no plugins, no forms, no `<base>` tag injection. |
| Trusted Types | `require-trusted-types-for 'script'` with no policies allowed, so the browser refuses any `innerHTML`/`document.write` style HTML injection. |
| No HTML parsing in JS | All content is rendered with `createElement` / `textContent`. Data is always treated as text, never as markup. |
| URL allow-list | Every link goes through `safeUrl()`: only `https:` or same-site paths. `javascript:` and `data:` URLs are dropped. |
| No third parties | Fonts are self-hosted (SIL OFL). The page makes zero requests to other domains, so there are no supply-chain scripts and visitors aren't tracked. |
| Referrer policy | `no-referrer`. Outbound links also use `rel="noopener noreferrer"`, which blocks reverse tabnabbing. |
| HTTPS | Served over HTTPS by GitHub Pages ("Enforce HTTPS" on); `upgrade-insecure-requests` in the CSP. |
| Stored data | The only stored value (day/night theme) is checked against an allow-list before use. |
| Disclosure | [`/.well-known/security.txt`](.well-known/security.txt) (RFC 9116) says how to report an issue. |

**Tested:** I injected XSS payloads (`<img onerror>`, `<script>`, `<svg onload>`, `javascript:` and `data:` links) into the site's data and checked them in Chromium. They rendered as plain text or were dropped. Inline scripts, `eval` and `innerHTML` were all blocked by the browser.

**Known limitation:** GitHub Pages doesn't allow custom HTTP response headers, so `frame-ancestors` / `X-Frame-Options`, `Permissions-Policy` and `X-Content-Type-Options` can't be set from here. The risk is low because the site has no logins, forms or actions to clickjack. Putting a CDN such as Cloudflare in front would allow those headers.

## Editing

All content (links, skills, certifications, write-ups) lives in the block at the top of `assets/main.js`.
