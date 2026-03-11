

# Physical Store Management - Detailed Plan

## Overview

Add a multi-store management system allowing the admin to create and manage physical retail locations, track per-store inventory, enable store pickup during checkout, and view store-level analytics.

## Database Schema

### New Tables

**`stores`** - Core store directory
```text
id              uuid PK
name            text NOT NULL
slug            text UNIQUE NOT NULL
phone           text
email           text
address_line1   text NOT NULL
address_line2   text
city            text NOT NULL
state           text NOT NULL
postal_code     text NOT NULL
latitude        numeric
longitude       numeric
is_active       boolean DEFAULT true
opening_time    time
closing_time    time
manager_name    text
manager_phone   text
display_order   integer DEFAULT 0
image_url       text
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

**`store_inventory`** - Per-store stock levels (optional granularity beyond global `products.stock_quantity`)
```text
id              uuid PK
store_id        uuid FK → stores.id
product_id      uuid FK → products.id
stock_quantity  integer DEFAULT 0
updated_at      timestamptz DEFAULT now()
UNIQUE(store_id, product_id)
```

**`store_staff`** - Link users to stores with a role
```text
id              uuid PK
store_id        uuid FK → stores.id
user_id         uuid (references auth.users via profiles pattern)
role            text DEFAULT 'staff' (staff | manager)
created_at      timestamptz DEFAULT now()
UNIQUE(store_id, user_id)
```

### Modifications to Existing Tables

- **`orders`**: Add `fulfillment_type` (`delivery` | `store_pickup`) DEFAULT `'delivery'`, and `pickup_store_id` (uuid, nullable FK → stores.id).

### RLS Policies

- `stores`: Anyone can SELECT active stores; admins have ALL.
- `store_inventory`: Admins have ALL; public can SELECT (to show availability).
- `store_staff`: Admins have ALL; staff can SELECT their own record.

## Feature Breakdown

### 1. Admin: Store Management Page (`/admin/stores`)

- CRUD for stores (name, address, contact, hours, image, active toggle)
- Geocoding-ready lat/lng fields for future map integration
- Assign manager from existing users
- New sidebar item in `AdminSidebar.tsx` under e-commerce section

### 2. Admin: Store Inventory Page (`/admin/stores/:id/inventory`)

- Table of products with per-store stock quantities
- Bulk stock adjustment (add/remove)
- Search and filter by product name, low stock
- Option to sync from global inventory

### 3. Checkout: Store Pickup Option

- Add a fulfillment type toggle: "Home Delivery" vs "Store Pickup"
- When "Store Pickup" is selected:
  - Show list of active stores with address and hours
  - Remove shipping address requirement
  - Set shipping_amount to 0
- Save `fulfillment_type` and `pickup_store_id` on the order

### 4. Customer: Store Locator

- New `/stores` page listing all active stores
- Show address, phone, hours, and optional map placeholder
- Link from Header navigation and Footer

### 5. Admin: Store Analytics (within existing Analytics page)

- Orders by store (pickup orders)
- Store inventory value
- Top stores by pickup volume

### 6. Order Management Updates

- Admin Orders page shows fulfillment type badge ("Delivery" / "Pickup")
- Filter orders by fulfillment type
- Show pickup store name in order detail dialog

## File Changes Summary

| Action | File |
|--------|------|
| Create | `src/pages/admin/Stores.tsx` - Store CRUD page |
| Create | `src/pages/admin/StoreInventory.tsx` - Per-store inventory |
| Create | `src/pages/StoreLocator.tsx` - Public store listing |
| Edit   | `src/components/admin/AdminSidebar.tsx` - Add "Stores" menu item |
| Edit   | `src/App.tsx` - Add routes `/admin/stores`, `/admin/stores/:id/inventory`, `/stores` |
| Edit   | `src/pages/Checkout.tsx` - Add fulfillment type toggle + store picker |
| Edit   | `src/pages/admin/Orders.tsx` - Show fulfillment type, filter, store name |
| Edit   | `src/pages/admin/Analytics.tsx` - Add store metrics card |
| Edit   | `src/components/Header.tsx` - Add "Stores" nav link |
| Migration | Create `stores`, `store_inventory`, `store_staff` tables; alter `orders` |

## Implementation Order

1. Database migration (tables + RLS + orders column)
2. Admin Stores CRUD page + sidebar + route
3. Admin Store Inventory page
4. Checkout fulfillment type toggle + store picker
5. Order management updates (badge, filter, detail)
6. Public Store Locator page
7. Analytics additions

