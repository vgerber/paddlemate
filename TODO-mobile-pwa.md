# Mobile + PWA TODO

## Done ✅

- [x] `vite-plugin-pwa` installed
- [x] Icons generated: `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`
- [x] `vite.config.ts` — VitePWA plugin with manifest + workbox (app shell precache, NetworkFirst `/api/**`)
- [x] `index.html` — `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `viewport-fit=cover`
- [x] `__root.tsx` — `BottomNavigation` component added, top nav links hidden on mobile (`xs: 'none'`)

---

## Todo ⬜

### Phase 2 — Root layout (finish `__root.tsx`)

- [ ] Bottom nav items navigate via TanStack Router `Link` (currently no routing wired up)
- [ ] Active tab derived from `useRouterState` pathname: `/` → 0, `/logs` → 1, `/proposals` → 2, `/settings` → 3
- [ ] Bottom nav `BottomNavigation` has `paddingBottom: 'env(safe-area-inset-bottom)'` for iPhone home indicator
- [ ] Main content wrapper gets `pb: { xs: 'calc(56px + env(safe-area-inset-bottom))', sm: 0 }` so content isn't hidden behind nav bar
  - Exception: map page (`/`) manages its own height — exclude it or let it override with `overflow: hidden`

### Phase 3 — Map page mobile (`src/routes/index.tsx`)

- [ ] Add `isMobilePanelOpen: boolean` state (default `false`)
- [ ] Sidebar `Box` hidden on mobile: `display: { xs: 'none', md: 'flex' }`
- [ ] Map container height: `calc(100dvh - 48px)` (fixes iOS Safari address-bar collapse)
- [ ] Search FAB — `position: absolute`, `bottom: calc(72px + env(safe-area-inset-bottom))`, `right: 16`, `display: { xs: 'flex', md: 'none' }`, opens panel
- [ ] Auto-open panel when `selectedWaterwayId` is set from URL on page load (mobile only)
- [ ] `handleSectionClick` — call `setIsMobilePanelOpen(true)` when on mobile
- [ ] Mobile panel overlay (`position: fixed`, top 48px, bottom `calc(56px + env(safe-area-inset-bottom))`, full width, `zIndex: 1200`, `display: { xs: 'flex', md: 'none' }`)
  - Close (×) `IconButton` top-right
  - Renders same `WaterwaySearchPanel` / `WaterwayDetailPanel` as desktop
  - `GaugeChartPanel` / `SectionChartPanel` rendered inside overlay (not below map) on mobile
- [ ] Desktop charts (`GaugeChartPanel` / `SectionChartPanel` below map) wrapped in `display: { xs: 'none', md: 'block' }`

### Phase 4 — Settings page (`src/routes/settings.tsx`)

- [ ] Outer flex container: `flexDirection: { xs: 'column', sm: 'row' }`
- [ ] Tab sidebar: `minWidth: { xs: 'auto', sm: 180 }`, `borderRight: { xs: 0, sm: 1 }`, `borderBottom: { xs: 1, sm: 0 }`, `borderColor: 'divider'`
- [ ] `Tabs` orientation: use `useMediaQuery` to switch between `'horizontal'` (xs) and `'vertical'` (sm+)

---

## Verify when done

1. `bun run build` — no TypeScript/build errors
2. DevTools 375px: bottom nav visible, top links hidden, branding shown
3. Map page 375px: full-screen map, FAB visible → tap → overlay opens; tap section on map → overlay opens with detail; × → full map
4. Settings page 375px: tabs horizontal at top, content below
5. Chrome DevTools → Application → manifest valid, service worker registered
6. Lighthouse PWA audit ≥ 90
7. Add to home screen — Android Chrome + iOS Safari
