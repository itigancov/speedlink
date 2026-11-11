# Publishing to the Chrome Web Store

How a release reaches the Chrome Web Store (CWS): where the credentials live, how to prove they work, how to rotate them, and what to do when the API path is broken. Product spec §14 says what a release is; this page says how the Store side is wired. No secret values appear here.

## Where things live

**Google Cloud**
- Project `speedlink-release` (project ID `speedlink-release`), owned by the CWS publisher account. No organization, no billing.
- The Chrome Web Store API is enabled on it.
- Service account `cws-publisher@speedlink-release.iam.gserviceaccount.com`: no IAM roles, at most one active JSON key.

**Chrome Web Store**
- The service account is linked in the CWS Developer Dashboard under **Account** → **Service accounts**. A publisher can link only one service account; linking another replaces `cws-publisher`.
- Extension ID `kddkenmaadibebdpekhfibihfpealhbe`.
- The publisher ID is in the dashboard URL (`…/devconsole/<publisher-id>`) and under Publisher settings.

**GitHub**
- The repo `itigancov/speedlink` is public, so Environment deployment rules and Environment secrets work on GitHub Free.
- Environment `chrome-web-store`, usable only from tags matching `v*` (one tag rule, no branch rules, no required reviewers).
- Its one **secret**: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (the PEM private key, with real newlines).
- Its three **variables**: `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`.

The names are the env vars `wxt submit` reads (`publish-browser-extension@6.2.0`), so `release.yml` maps them one-to-one.

## What belongs in `release.yml`

These are behaviour, not credentials, so they are set in the workflow, not the Environment:

- `CHROME_API_VERSION=v2`. Without it `wxt submit` silently uses the v1.1 API, which stopped working on 2026-10-15.
- `CHROME_PUBLISH_TYPE=STAGED_PUBLISH`. This is deferred publish: the item is submitted for review and published by hand once approved. `CHROME_SKIP_SUBMIT_REVIEW` only uploads and is not what we want.
- `CHROME_ZIP`: the `*-chrome.zip` from `wxt zip`.

Do not copy WXT's publishing docs or its GitHub Action example: they show only the CWS API v1 secrets (client ID, client secret, refresh token). `wxt submit` also accepts no whole JSON key, neither a file nor a string: the client email and private key are taken out of it.

## Dry run

`wxt submit --dry-run` checks the zip exists, exchanges a signed JWT for a token at Google, calls the read-only v2 `fetchStatus` on the Store item, and stops. It never uploads or publishes. One green run proves the key, the dashboard link, the publisher ID and the extension ID.

Locally, with every value inline for that one command and no `.env.submit`:

```bash
pnpm zip
```

```bash
CHROME_API_VERSION=v2 \
CHROME_ZIP=.output/speedlink-<version>-chrome.zip \
CHROME_EXTENSION_ID=kddkenmaadibebdpekhfibihfpealhbe \
CHROME_PUBLISHER_ID=<publisher-id> \
CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL=<service-account-email> \
CHROME_SERVICE_ACCOUNT_PRIVATE_KEY="$(jq -r .private_key <key-file>.json)" \
pnpm exec wxt submit --dry-run
```

It ends with "DRY RUN: Skipped upload and publishing". If it fails, check the four values first. A freshly linked service account may need time on Google's side: retry after 24 hours before falling back to a manual upload.

## Rotating the key

No schedule: rotate when a leak is suspected or the Environment's settings change. Keep at most one active key.

1. In Google Cloud (project `speedlink-release`), **IAM & Admin** → **Service accounts** → `cws-publisher` → **Keys** → **Add key** → **Create new key** → **JSON**.
2. Set the secret straight from the file, so the newlines stay intact and the value never shows on screen:

   ```bash
   jq -r .private_key <key-file>.json | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env chrome-web-store --repo itigancov/speedlink
   ```

3. Run the dry run above with the new key.
4. Delete the old key in the **Keys** tab.
5. Delete the downloaded JSON file and empty it from the Trash. The only copy is then the GitHub secret.

## Manual upload fallback

When the API path is broken, a release still ships by hand:

1. Download the zip from the GitHub Release.
2. In the CWS Developer Dashboard, open the item, then **Package** → **Upload new package**.
3. **Submit for review**, choosing to publish manually after approval (the same deferred publish).
