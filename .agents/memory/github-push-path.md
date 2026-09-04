---
name: GitHub push path
description: How code gets pushed to GitHub for this project (fork owned by the connected account)
---

The Replit GitHub connection is authorized as **ilyashumfans-rgb**, which has NO write access to the original repo `ilyasiconic/iconic-fitness-app` (owner login unrecoverable in practice; collaborator invites kept failing).

**Current push path (Aug 2026):** server-side fork **`ilyashumfans-rgb/iconic-fitness-app`** — the connection has full write. Push files via GitHub Contents API (`PUT /repos/ilyashumfans-rgb/iconic-fitness-app/contents/<path>` with base64 + current sha, branch main) from a `"use impure"` block using `listConnections("github")[0].proxyFetch`. Local git `origin` now points at the fork.

**Why:** original repo owner account login was a persistent blocker for the novice user; fork removed all dependence on it.

**How to apply:** always push to the fork, never the ilyasiconic repo. EAS APK builds on expo.dev must be (re)pointed at the fork — remind the user at the next APK build. `gitPush` callback no longer exists; shell `git push` auth fails. API commits diverge from local history — content matches but shas differ; that's accepted.
