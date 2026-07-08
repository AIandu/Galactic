---
name: CelesTrak 403 block
description: CelesTrak celestrak.org/pub/TLE/* returns HTTP 403 for server-side requests; browser-like User-Agent headers do not help.
---

CelesTrak returns 403 Forbidden on all `/pub/TLE/*.txt` URLs when fetched server-side (Node.js). The old `celestrak.com` domain has an expired certificate. Even setting browser-like `User-Agent` and `Accept` headers does not bypass the block.

**Why:** Likely Cloudflare bot protection blocking non-browser clients, or deliberate IP-range restriction.

**How to apply:** Always include an embedded TLE fallback dataset (see `artifacts/api-server/src/lib/tleData.ts`) covering all satellite categories. The refresh pipeline should attempt live fetch → active.txt fallback → embedded data. If CelesTrak ever starts working again, the live path will automatically take over.

Alternative sources to investigate if live data is needed: Space-Track.org (requires free account + credentials), n2yo.com API (requires API key), or a CORS proxy in front of CelesTrak.
