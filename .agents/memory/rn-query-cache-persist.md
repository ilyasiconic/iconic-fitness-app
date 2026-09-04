---
name: RN persisted query cache — public-only
description: Rules for the Expo app's persisted react-query cache (privacy + speed)
---
The iconic-app query client persists to AsyncStorage via PersistQueryClientProvider, but ONLY public catalog queries (whitelist of URL prefixes in `_layout.tsx`: gyms, classes, trainers, memberships, store products/categories, home-slides, faq, links). Personal queries stay memory-only.

**Why:** a single identity-agnostic persisted cache leaks a previous member's profile/orders/bookings to guests or other users on a shared device (architect flagged as severe). Sign-out `queryClient.clear()` is async/throttled and not a durable boundary.

**How to apply:** when adding new public GET endpoints that should load instantly offline, add their `/api/...` prefix to `PUBLIC_PERSIST_PREFIXES` and bump the `buster` string. Never whitelist anything user-scoped. Defaults: staleTime 60s, gcTime 24h.
