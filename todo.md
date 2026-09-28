# TriRide — Post-Proposal Development Plan

This is your to-do list, cleaned up and grouped so it reads like an actual build plan instead of a list of scattered ideas. Use this as your working checklist.

### Audit status (added after the code review)

The boxes below are the original author's claims. They were **not** re-verified by
running the app — this was a static review. Treat `[x]` as "believed done", not
"confirmed done".

**Fixed during the review (committed to the working tree, not yet pushed):**

- Fare feature removed end-to-end (option C: the `trips.fare` column is left in
  place but is no longer read or written by any code).
- Hardcoded Resend API key removed from the client. Email/SMS now go through the
  `notify-approval` Edge Function only, which reads `Deno.env`. The key was
  never committed, so rotation is still required.
- Admin RLS no longer trusts `auth.jwt() -> 'user_metadata' ->> 'role'`. All
  admin policies use `public.is_admin()` only, and the signup trigger downgrades
  a metadata `role` of `admin` to `student`.
  **Run `supabase/migration_security_admin_rls.sql` against the live database.**
- `AdminDashboard` is now gated on the live role and can no longer be re-entered
  with no session.
- Deleted-but-tracked files (`design/prototypes/*`, `data/mockUsers.js`)
  untracked from git.
- Bottom nav bar now renders on Profile and Settings (it is in the tab list but
  was not in the render condition, so the bar vanished when you tapped the tab).
- `SettingsScreen` referenced three typography tokens that do not exist in
  `theme.js`; mapped to real ones.
- Profile "Trip History" sent drivers to the student-only `MyOrders`; drivers now
  go to `DriverCompletedRides`.
- Driver Start/Complete button had no in-flight guard, so a double tap produced
  a bogus "Could not complete trip" alert.
- `activeTripStore` used one device-wide key, so a second driver on the same
  device inherited the previous driver's active trip. Now verified by `driver_id`.
- Removed fabricated/decorative UI: the hardcoded "29°C Sunny & Clear" weather
  widget, the three Settings toggles that reset silently, the fake "Cache
  cleared" dialog, and the typing indicator that could never render.
- Failed message sends no longer disappear silently.
- Android `softwareKeyboardLayoutMode: "resize"` in `app.json`; every
  `KeyboardAvoidingView` uses `behavior="padding"`. (Native config — needs a
  rebuild, does not apply in Expo Go. iOS is fixed without one.)

**UI/UX refinement pass — student journey only (8 files):**

`theme.js` gained six additive token groups: `INK`, `CANVAS`, `ACCENT`,
`ELEVATION`, `BORDERS`, `GRADIENTS`. Every pre-existing export (`COLORS`,
`SPACING`, `ROUNDED`, `TYPOGRAPHY`, `SHADOWS`) is unchanged, so screens outside
this pass are untouched. `expo-linear-gradient` is installed and used on 3–5
surfaces per screen.

Converted to 0 raw hex, 0 hard `1px` strokes, 0 inline shadow overrides:
`components/BottomNavBar.js`, `components/TriRideTextLogo.js`,
`StudentDashboardScreen`, `ProfileScreen`, `BookRideScreen`,
`OrderDetailsScreen`, `TrackDriverScreen`, `MessagesScreen`.

The two remaining `1px` borders in the student journey are intentional: the
destructive `Cancel` outline on `OrderDetailsScreen` and `TrackDriverScreen`,
where the border carries meaning. Everything else moved to
`StyleSheet.hairlineWidth` at low alpha.

Dead code removed as a side effect of the above, listed for the record:
9 unused navbar styles in `StudentDashboardScreen` (`App.js` owns the navbar),
3 unused avatar styles in `ProfileScreen` (`components/UserAvatar` renders it),
and 2 now-unused `react-native` imports (`Image`, `Animated`).

**Known open issues (not fixed):**

- `MAX_PASSENGERS = 7` is a fleet-wide cap, not a per-trip one.
- `TrackDriverScreen` and `OrderDetailsScreen` draw a hardcoded driver position
  and present it identically to a live one, with no "estimated" label.
- Driver screens, auth screens, `AdminDashboard`, and `MyOrdersScreen` are still
  on the old visual style. 278 raw hex colours remain app-wide, 87 of which are
  the token definitions themselves in `theme.js`.
- Four pollers run with no `AppState` background guard.
- The two "Safety" tiles on the home screen look tappable but are plain `View`s
  with no `onPress` (pre-existing).
- No accessibility props app-wide (a handful were added to the navbar FAB, the
  send button, and the profile photo-edit button).

---

## ⚠️ Ground Rule — Scope Control

**Only touch what's listed in this plan. Everything else in the app (student side and driver side) stays exactly as it already works.**

- Do not rename, remove, or rewire any existing button, screen, or function that isn't explicitly called out in a phase below
- Do not "improve while you're in there" — if something looks messy but isn't part of this plan, leave it and note it separately for later
- Before editing a file, check if the change is actually required by one of the items below — if it's not, skip it
- If a change in one phase (e.g. nav bar redesign) has a side effect on an unrelated feature, flag it and confirm before proceeding, don't silently "fix" it
- Every existing working feature (booking flow, ride matching, whatever else is already functional) must still work exactly the same after each phase — treat this as a regression check, not just a feature-add checklist

---

## Phase 0 — Code Audit (Do This First)

**Goal:** Understand what already exists before changing anything, so nothing breaks and no work is duplicated.

- [ ] Review the full folder structure of the app (student side, driver side, admin dashboard, shared components)
- [ ] Review current navigation setup (React Navigation / Expo Router config)
- [ ] Review current Supabase schema (tables, relationships, RLS policies) — especially anything related to rides, users, and any existing chat/messages table
- [ ] Identify which features below are partially built vs. not started at all
- [ ] Confirm whether to continue with current architecture or refactor first

> **Note:** I can do this step with you, but I need the actual project files (or at least a zip of key folders) uploaded to this chat. Once I can see the code, I'll give you a real assessment of what's solid, what's fragile, and what order to tackle things in.

---

## Phase 1 — Navigation & UI Foundation

These come first because messaging, home screen updates, and everything else will sit on top of this navigation structure.

### 1.1 Student Dashboard — Booking Button Redesign
- [x] Remove "Bookings" as a regular nav tab item
- [x] Replace it with a **floating action button (FAB)** — a circular "+" button
- [x] Tapping the "+" opens the booking flow directly
- [x] No text label needed on the button — icon only

### 1.2 Navigation Bar — Visual & Interaction Upgrade
- [x] Redesign the bottom nav bar to look more polished/professional (icons, spacing, active-state indicator pill)
- [x] Add a **tap animation** (scale bounce) when a nav button is pressed
- [x] Active tab tracks dynamically as user navigates

### 1.3 General Loading & Motion
- [x] Skeleton loading state for Student Dashboard (TripBannerSkeleton)
- [x] Skeleton loading state for Driver Dashboard (RequestCardSkeleton x2)
- [x] Add subtle transition animations between screens/actions

### 1.4 UI Consistency Rules (apply across every screen you touch)
- [x] No overlapping buttons, containers, or input fields
- [x] Consistent spacing, corner radius, font sizes, and color usage app-wide
- [x] Treat this as a **rule to check on every future screen**, not a one-time fix

---

## Phase 2 — Messaging Feature (Student ↔ Driver)

This is the biggest new feature. Build it carefully — it touches accounts, privacy, and real-time data.

### 2.1 Core Rules
- [x] A student and driver can **only message each other if they are matched on an active or completed ride** — no open/random messaging between strangers
- [x] Each conversation should be scoped to a specific ride pairing (or at minimum, a specific student-driver relationship created through a ride)

### 2.2 Conversation List ("Inbox")
- [x] Both student and driver dashboards need a **chat list/inbox screen** — like Messenger's home screen — showing:
  - Who they're talking to (name + photo)
  - Last message preview
  - Timestamp
- [x] Tapping a conversation opens the actual chat thread

### 2.3 Chat Thread Screen
- [x] Real-time message sending/receiving (Supabase Realtime)
- [x] Message bubbles styled like a standard messaging app (sent vs. received, timestamps)
- [x] Basic states: sending, sent, delivered (read receipts optional for later)

### 2.4 Backend Requirements
- [x] `conversations` table (linking a student_id + driver_id, tied to a ride)
- [x] `messages` table (conversation_id, sender_id, content, created_at)
- [x] Row-Level Security so a user can only read/write messages in conversations they're part of — this is what actually enforces "only driver and passenger can talk to each other"

---

## Phase 3 — Driver Dashboard Improvements

### 3.1 Active Ride Persistence ("Ongoing Ride" State)
- [x] Once a driver accepts a ride, store that ride's state persistently (in app state + Supabase)
- [x] Driver should be able to **leave the ride-progress screen and come back** without losing the accepted ride
- [x] Show ride progress details when they return (pickup, drop-off, status)

### 3.2 Driver Home Screen
- [x] Show quick stats: **recent completed rides count** and **driver rating**
- [x] Redesign the **Accept / Decline** ride request UI to look cleaner and more professional (clear buttons, ride details visible before deciding)

### 3.3 Overall Driver Dashboard UX
- [x] Redesign with **ordinary users in mind** — assume the driver may not be tech-savvy
- [x] Prioritize clarity over cleverness: bigger tap targets, clear icons, minimal steps to accept/decline/complete a ride
- [x] Clean visual hierarchy so the most important info (next ride, current status) is immediately visible

---

## Phase 4 — Student Dashboard Home Enhancements

- [x] Add a section showing **available drivers nearby**, broken down by status:
  - [x] Online / available
  - [x] Currently on a ride (ongoing)
  - [x] Waiting for a ride request
- [x] Optional: weather widget/feature
- [x] Style this section to feel premium — consider a subtle animation for the driver list (e.g., a soft queue/list animation as drivers load in)
- [x] Goal: this should be the "wow" section of the student home screen

---

## Phase 5 — Profile Management

- [x] Fix and finalize **profile picture upload/display** for both student and driver accounts
- [x] Make sure it's:
  - [x] Responsive across screen sizes
  - [x] Actually functional (upload, preview, save, persist after refresh)
  - [x] Has a sensible fallback (initials or default avatar) when no photo is set




---

## Secrets

No API keys belong in this file or in any client-side source file.
`EXPO_PUBLIC_*` values are inlined into the shipped app bundle.

| Secret | Where it belongs |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` (gitignored) |
| `EXPO_PUBLIC_GEOAPIFY_API_KEY` | `.env` (gitignored), restrict by domain in the Geoapify console |
| `RESEND_API_KEY`, `SEMAPHORE_API_KEY`, `FROM_EMAIL` | `supabase secrets set` — read via `Deno.env` in the Edge Function only |