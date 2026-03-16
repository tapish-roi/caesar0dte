
## Root Cause

The database query confirms the exact bug:

```
invite id: 32cb4295 | contact: rroiabukasis123@gmail.com | student_id: NULL | matched_user: ea17c46b
```

The invite exists with the student's email but `student_id` is NULL. The `match_pending_invites` trigger only fires on **INSERT into `auth.users`** (new signups). When the mentor invites a student who **already has an account**, the trigger never runs — so `student_id` stays NULL forever.

The student's query in `StudentDashboard.tsx` (line 335) filters by `.eq('student_id', user!.id)` — which returns nothing because `student_id` is NULL.

---

## Two-Part Fix

### 1. Database trigger on `community_invites` INSERT
Create a new trigger that fires when a new invite row is inserted. It looks up `auth.users` by email (or phone) and immediately sets `student_id` if the user already exists. This handles the "invite an existing user" case.

```sql
CREATE OR REPLACE FUNCTION public.match_invite_on_insert()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  -- If user already exists with this email or phone, set student_id immediately
  UPDATE public.community_invites
  SET student_id = au.id
  FROM auth.users au
  WHERE community_invites.id = NEW.id
    AND community_invites.student_id IS NULL
    AND (au.email = NEW.contact OR au.raw_user_meta_data->>'phone' = NEW.contact);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_community_invite_created
  AFTER INSERT ON public.community_invites
  FOR EACH ROW EXECUTE FUNCTION public.match_invite_on_insert();
```

Also run a one-time retroactive fix for the existing pending invite:
```sql
UPDATE public.community_invites ci
SET student_id = au.id
FROM auth.users au
WHERE ci.student_id IS NULL
  AND ci.status = 'pending'
  AND (ci.contact = au.email OR ci.contact = au.raw_user_meta_data->>'phone');
```

### 2. Fallback query in `StudentDashboard.tsx`
As a secondary safety net, update the invites query to also check by the user's email when `student_id` matches OR the contact matches the user's email. This handles edge cases where the trigger hasn't fired yet:

```typescript
// Query invites by student_id OR by contact email (for existing-user invites)
const { data } = await supabase
  .from('community_invites')
  .select('id, mentor_id, contact, status')
  .or(`student_id.eq.${user!.id},contact.eq.${user!.email}`)
  .eq('status', 'pending');
```

---

## Files to Change

- **New migration**: adds the `match_invite_on_insert` trigger + retroactive fix for existing `student_id = NULL` invites
- **`src/pages/StudentDashboard.tsx`**: update the invites query (line ~334) to also match by `contact = user.email` as fallback
