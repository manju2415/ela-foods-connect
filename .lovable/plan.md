
## Plan: Remove Upline Commission completely

### Changes

**1. Database (migration)**
- Delete the `upline_commission` row from `mlm_settings`:
  ```sql
  DELETE FROM public.mlm_settings WHERE key = 'upline_commission';
  ```

**2. `src/pages/admin/MLMSettings.tsx`**
- Remove the entire **Upline Commission** `<Card>` block from the JSX.
- Remove `upline_commission` from the local `useState` defaults so it's no longer initialized, loaded, or saved.
- Leave Registration Fees, Referral Bonuses, Purchase Commission, Multi-Level Founder Commissions, and User Level Hierarchy intact.

### Files changed
| File | Change |
|------|--------|
| `supabase/migrations/<new>.sql` | `DELETE` row where `key = 'upline_commission'` |
| `src/pages/admin/MLMSettings.tsx` | Remove Upline Commission card + state default |

No other files reference `upline_commission`, and no DB function reads this key — safe to remove.
