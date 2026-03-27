

# Separate Founding Member and MLM Admin into Distinct Roles

## Current State
- `app_role` enum: `super_admin`, `admin`, `founding_member`, `member`, `delivery_partner`
- `founding_member` currently serves double duty: MLM network founder **and** MLM admin access
- MLM login checks `is_admin()` OR `is_founding_member()` to grant `/mlm-admin` access

## Problem
A founding member (network tier) shouldn't automatically get MLM admin access. MLM Admin should be a separate role assignment.

## Plan

### 1. Add `mlm_admin` to the `app_role` enum (DB migration)
```sql
ALTER TYPE public.app_role ADD VALUE 'mlm_admin';
```

### 2. Create `is_mlm_admin()` database function (DB migration)
- Returns true if user has `mlm_admin` or `super_admin` role

### 3. Update `handle_new_user` trigger
- Phone `9999000003` → assign **both** `founding_member` and `mlm_admin` roles (for test account backward compat)

### 4. Update MLM Login (`src/pages/MLMLogin.tsx`)
- Check `is_mlm_admin()` instead of `is_founding_member()` for access control

### 5. Update AdminLayout (`src/components/admin/AdminLayout.tsx`)
- For MLM routes, check `is_mlm_admin()` instead of `has_role('founding_member')`

### 6. Update RoleBasedRedirect (`src/components/RoleBasedRedirect.tsx`)
- Add `mlm_admin` check → redirect to `/mlm-admin`
- `founding_member` without `mlm_admin` → `/dashboard` (regular member view)

### 7. Update `useUserRole` hook
- Add `isMLMAdmin` flag using the new `is_mlm_admin()` RPC

### 8. Update Auth.tsx `resolveRoleRedirect`
- `mlm_admin` → `/mlm-admin`
- `founding_member` (without mlm_admin) → `/dashboard`

### 9. Update admin sidebar routing
- `super_admin` → full admin access
- `admin` (store admin) → `/admin/products` only (products, inventory, categories, stores)
- `mlm_admin` → `/mlm-admin` only
- `founding_member` → member dashboard (no admin access)

### Role Matrix (Final)

| Role | Purpose | Landing | Admin Access |
|------|---------|---------|-------------|
| `super_admin` | Full platform control | `/admin` | All admin + all MLM |
| `admin` | Store employee (inventory) | `/admin/products` | Products, inventory, categories, stores only |
| `mlm_admin` | Network management | `/mlm-admin` | MLM settings, tree, users, wallets |
| `founding_member` | Top-tier MLM member | `/dashboard` | None (member dashboard) |
| `member` | Regular MLM member | `/dashboard` | None |
| `delivery_partner` | Driver | `/driver-app` | None |

### Files to Modify
1. **DB migration** — Add `mlm_admin` enum value, create `is_mlm_admin()` function, update `handle_new_user` trigger
2. **`src/hooks/useUserRole.ts`** — Add `isMLMAdmin` state
3. **`src/pages/MLMLogin.tsx`** — Use `is_mlm_admin` check
4. **`src/components/admin/AdminLayout.tsx`** — Use `is_mlm_admin` for MLM routes
5. **`src/components/RoleBasedRedirect.tsx`** — Route `mlm_admin` → `/mlm-admin`, separate from `founding_member`
6. **`src/pages/Auth.tsx`** — Update `resolveRoleRedirect`
7. **`src/components/admin/AdminSidebar.tsx`** — Filter menu for store admin (`admin` role)
8. **`src/pages/admin/AdminDashboard.tsx`** — Redirect non-super-admin to `/admin/products`

