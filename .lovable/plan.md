

# Unified "Elabazar" APK with Login-First Flow

## What Changes

Currently the app has separate entry points for Customer, Driver, and Member roles, plus the homepage (`/`) shows the storefront without requiring login. The user wants:

1. **Single APK** named "Elabazar" (rename from "ELA Foods")
2. **Login page as the landing page** -- unauthenticated users see Auth, not the storefront
3. **Role-based dashboard routing** -- after login, each user type sees only their relevant dashboard

## Implementation Plan

### 1. Rename App to "Elabazar"
- Update `capacitor.config.ts`: `appName: 'Elabazar'`
- Update PWA manifests and logo references where "ELA Foods" appears in Auth page branding

### 2. Make Login the Default Landing Page
- Change the root route (`/`) to render `Auth` instead of `Index`
- Move the storefront (`Index`) to `/shop` so logged-in customers can still browse products
- Update `Header.tsx` nav links: Home link points to `/shop`
- After login, redirect users based on their role (already partially implemented in `Auth.tsx`)

### 3. Role-Based Post-Login Routing
Extend the existing `handleLogin` in `Auth.tsx` to check all roles:

```text
Login Flow:
  ├─ Is delivery partner? → /driver-app
  ├─ Is admin/super_admin? → /admin
  ├─ Is MLM manager? → /mlm-admin  
  ├─ Has member role? → /dashboard (member dashboard)
  └─ Default (customer) → /shop (storefront + shopping)
```

The existing code already handles delivery partner redirection. We extend it to also check `user_roles` for admin/member routing.

### 4. Protect Routes
- Add an auth guard wrapper so unauthenticated users hitting `/shop`, `/dashboard`, `/products`, etc. get redirected to `/` (login)
- The `Auth` page's existing `useEffect` that redirects logged-in users will now send them to their role-based destination instead of always `/dashboard`

### 5. Update Capacitor Config
- Single `capacitor.config.ts` with `appName: 'Elabazar'`
- Remove the need for role-specific config files (`capacitor.config.customer.ts`, etc.) since it's one unified APK

### Files to Change

| Action | File | Change |
|--------|------|--------|
| Edit | `capacitor.config.ts` | Rename to "Elabazar" |
| Edit | `src/App.tsx` | Root route → Auth, storefront → `/shop` |
| Edit | `src/pages/Auth.tsx` | Role-based redirect logic after login; update auto-redirect for already-logged-in users |
| Edit | `src/components/Header.tsx` | Home link → `/shop`; nav adjustments |
| Create | `src/components/AuthGuard.tsx` | Wrapper component that redirects unauthenticated users to `/` |
| Edit | `src/pages/Index.tsx` | No structural changes, just accessed via `/shop` now |
| Edit | Various mobile pages | Remove separate auth redirects since unified app handles it |

### What Each User Sees After Login

- **Customer**: Redirected to `/shop` (storefront with products, cart, orders)
- **Driver**: Redirected to `/driver-app` (delivery dashboard)  
- **Member**: Redirected to `/dashboard` (MLM network, wallet, referrals)
- **Admin**: Redirected to `/admin` (e-commerce admin panel)
- **MLM Manager**: Redirected to `/mlm-admin` (network management)

