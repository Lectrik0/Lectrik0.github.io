# lectrik0.github.io

Personal site of **Ali Ahmed**, a cybersecurity student building toward cloud security.
Live at https://lectrik0.github.io

It's a static site with no backend, no build step, no third-party scripts and no tracking.

## Security

Even a static site can be attacked through XSS, malicious links or third-party scripts. This one is hardened like this:

| Control | How it's done here |
|---|---|
| Content Security Policy | `default-src 'none'`. Scripts, styles, fonts, images and the content file load only from this site. No inline scripts, no `eval`, no plugins, no forms, no `<base>` tag injection. |
| Trusted Types | `require-trusted-types-for 'script'` with no policies allowed, so the browser refuses any `innerHTML`/`document.write` style HTML injection. |
| No HTML parsing in JS | All content is rendered with `createElement` / `textContent`. Data is always treated as text, never as markup. |
| URL allow-list | Every link goes through `safeUrl()`: only `https:` or same-site paths. `javascript:` and `data:` URLs are dropped. |
| No third parties | Fonts are self-hosted (SIL OFL). The page makes zero requests to other domains, so there are no supply-chain scripts and visitors aren't tracked. |
| Referrer policy | `no-referrer`. Outbound links also use `rel="noopener noreferrer"`, which blocks reverse tabnabbing. |
| HTTPS | Served over HTTPS by GitHub Pages ("Enforce HTTPS" on); `upgrade-insecure-requests` in the CSP. |
| Stored data | The only stored values (day/night theme, flags found) are checked against allow-lists before use. |
| Disclosure | [`/.well-known/security.txt`](.well-known/security.txt) (RFC 9116) says how to report an issue. |

**Tested:** I injected XSS payloads (`<img onerror>`, `<script>`, `<svg onload>`, `javascript:` and `data:` links) into the site's data and checked them in Chromium. They rendered as plain text or were dropped. Inline scripts, `eval` and `innerHTML` were all blocked by the browser.

**Known limitation on GitHub Pages:** it doesn't allow custom HTTP response headers, so `frame-ancestors` / `X-Frame-Options`, `Permissions-Policy`, HSTS and `X-Content-Type-Options` can't be set there. The AWS setup below adds all of them.

## Hosting on AWS (`infra/`)

[`infra/site.yaml`](infra/site.yaml) is a CloudFormation template for serving the same site from AWS:

- **S3** bucket that is fully private (public access blocked, owner-enforced, encrypted, versioned, TLS-only bucket policy).
- **CloudFront** reads it through Origin Access Control, so the bucket is never public. HTTP/2 + HTTP/3, HTTPS only, TLS 1.2+ with a custom domain.
- **Security response headers:** CSP with `frame-ancestors 'none'`, HSTS (2 years, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, and the `Server` header removed.
- **Keyless deploys:** GitHub Actions gets short-lived credentials through OIDC. The role can only be assumed from this repo's `main` branch and can only write to this bucket and invalidate this distribution. No AWS keys are stored anywhere.
- **Cost guardrail:** an AWS Budget emails a warning at 80% of a small monthly limit.

[`.github/workflows/deploy-aws.yml`](.github/workflows/deploy-aws.yml) deploys on every push to `main` (actions pinned to commit SHAs). It skips itself until the repo variables `AWS_ROLE_ARN`, `SITE_BUCKET` and `DISTRIBUTION_ID` exist.

The editor page gets its own header policy (CSP that also allows `api.github.com`, no caching, `noindex`). Both files pass `cfn-lint` and `actionlint`.

## Hidden flags

There are four flags hidden on the site. The checker on the home page compares SHA-256 hashes in the browser, so the flags aren't readable from the code that checks them.

## Pages

| Path | What |
|---|---|
| `/` | The story (Chapter 1 opens the full GIU course list), skills, certifications, write-ups, flags |
| `/cv.html` | CV, prints cleanly to one A4 page |
| `/writeups/` | Write-ups, each told as a comic "issue" |
| `/404.html` | Not-found page |
| `/data/site.json` | All site content |

## Editing content

All content (profile, story text, courses, skills, certifications, write-ups, CV) lives in [`data/site.json`](data/site.json). The pages load it and render it as text.

There's also a private editor page. It needs no server and keeps no secrets in this repo:

- The real key is a GitHub fine-grained token that can only write to this repo's contents.
- On first use the token is encrypted in the browser (AES-GCM-256, key from the password via PBKDF2-SHA256 with 600,000 rounds, username bound as authenticated data) and stored only on that device. The username, password and token are never stored in plain text or sent anywhere except the token to GitHub's API.
- Unlocking decrypts the token into memory; locking, closing the tab or 30 idle minutes forgets it. Wrong attempts are slowed down.
- Saving commits `data/site.json` through the GitHub API, and the site rebuilds.
- The editor page has its own CSP that only allows connections to `api.github.com`, and Trusted Types like the rest of the site.

Anyone can load the editor page, but without the encrypted token on their own device and the password, it can't do anything.
