# Simplified Podcast Calendar System

## What You Actually Need

A **client-focused booking calendar** to:
- ✅ See which clients have podcasts on what day
- ✅ Track overall bookings per month
- ✅ See booking status (booked vs in progress vs published)
- ✅ Click into each client to see their progress
- ✅ Simple booking management (no complex podcast database)

---

## Simplified Database Schema

### `clients` table
- Basic client info (name, email, status, notes)
- Status: active / paused / churned

### `bookings` table
- client_id (link to client)
- podcast_name (just text, no separate table)
- podcast_url, host_name (optional details)
- scheduled_date, recording_date, publish_date
- **status**: booked → in_progress → recorded → published
- notes, prep_sent

**No separate podcast database.** Just enter podcast details when creating a booking.

---

## UI Structure (3 Main Views)

### 1. Calendar Dashboard (`/admin/calendar`) - YOUR MAIN VIEW

```
┌─────────────────────────────────────────────────────────────────┐
│ Podcast Calendar                                                │
├─────────────────────────────────────────────────────────────────┤
│ [Stats Cards]                                                   │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ Active   │ │ This     │ │ Booked   │ │ In       │          │
│ │ Clients  │ │ Month    │ │          │ │ Progress │          │
│ │   12     │ │   24     │ │    8     │ │    4     │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│ View: [Month ▼] [Week] [Day]   Year: [2025 ▼]   Search: [...] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ MONTHLY VIEW:                                                   │
│ ┌──────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐    │
│ │Client│Jan│Feb│Mar│Apr│May│Jun│Jul│Aug│Sep│Oct│Nov│Dec│    │
│ ├──────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤    │
│ │ClientA│ 3 │ 2 │ 4 │ 1 │ 3 │ 2 │ 0 │ 1 │ 2 │ 1 │ 0 │ 0 │    │
│ │      │🟢2│🟡1│🟢3│   │   │   │   │   │   │   │   │   │    │
│ │ClientB│ 1 │ 1 │ 2 │ 2 │ 1 │ 3 │ 1 │ 0 │ 1 │ 2 │ 1 │ 0 │    │
│ │      │🟢1│   │🟡1│   │   │   │   │   │   │   │   │   │    │
│ └──────┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘    │
│                                                                 │
│ 🟢 Booked   🟡 In Progress   🔵 Recorded   ✅ Published        │
│                                                                 │
│ OR DAILY VIEW:                                                  │
│ ┌────────────┬──────────────┬──────────────┬──────────┐       │
│ │ Date       │ Client       │ Podcast      │ Status   │       │
│ ├────────────┼──────────────┼──────────────┼──────────┤       │
│ │ Jan 15     │ Client A     │ Tech Talks   │ 🟢 Booked│       │
│ │ Jan 16     │ Client B     │ Biz Show     │ 🟡 In Prog│      │
│ │ Jan 22     │ Client A     │ Marketing Pod│ 🟢 Booked│       │
│ └────────────┴──────────────┴──────────────┴──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Monthly Grid**: See which clients are booked each month (like your Google Sheet)
- **Status Indicators**: Color-coded dots showing status breakdown
- **Click month cell**: Opens modal with all bookings for that client/month
- **Daily View**: Toggle to see day-by-day what's scheduled
- **Filters**: Year selector, search clients, filter by status

---

### 2. Clients List (`/admin/clients`)

```
┌─────────────────────────────────────────────────────────────────┐
│ Clients                                      [+ Add Client]     │
├─────────────────────────────────────────────────────────────────┤
│ Search: [__________]  Filter: [Active ▼]                       │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────┬────────┬───────┬──────────┬───────────┬────────┐ │
│ │ Name     │ Status │ Total │ Booked   │ In Prog   │ Actions││
│ ├──────────┼────────┼───────┼──────────┼───────────┼────────┤ │
│ │ Client A │🟢Active│  24   │    3     │    1      │ View   │ │
│ │ Client B │🟢Active│  18   │    2     │    0      │ View   │ │
│ │ Client C │🟡Paused│   8   │    0     │    0      │ View   │ │
│ └──────────┴────────┴───────┴──────────┴───────────┴────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Shows:**
- Client name and status
- Total bookings (lifetime)
- Current booked count
- Current in-progress count
- Quick link to detail view

---

### 3. Client Detail (`/admin/clients/:id`)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back    Client Name                      [Edit] [Add Booking] │
│ 🟢 Active • Joined Jan 2024                                    │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────────────────────────┐  │
│ │ Client Info      │ │ Progress Overview                    │  │
│ │ Email: ...       │ │ ┌────────┐ ┌────────┐ ┌────────┐   │  │
│ │ Contact: ...     │ │ │ Total  │ │ Booked │ │ In Prog│   │  │
│ │ LinkedIn: ...    │ │ │   24   │ │    3   │ │    1   │   │  │
│ └──────────────────┘ │ ┌────────┐ ┌────────┐ ┌────────┐   │  │
│                      │ │Recorded│ │Published│ │This Mo │   │  │
│                      │ │   12   │ │    8   │ │    2   │   │  │
│                      │ └────────┘ └────────┘ └────────┘   │  │
│                      └──────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│ Booking Timeline                                                │
│ Filter: [All Status ▼]  Sort: [Newest ▼]                       │
│ ┌────────────┬───────────────┬────────────┬──────────┬───────┐│
│ │ Date       │ Podcast       │ Host       │ Status   │Actions││
│ ├────────────┼───────────────┼────────────┼──────────┼───────┤│
│ │ Jan 15     │ Tech Talks    │ John Doe   │🟢 Booked │ Edit  ││
│ │ Jan 22     │ Marketing Pod │ Jane Smith │🟡 In Prog│ Edit  ││
│ │ Dec 10     │ Biz Show      │ Bob Jones  │✅Published│ View  ││
│ └────────────┴───────────────┴────────────┴──────────┴───────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Shows:**
- Full client information
- Booking counts by status
- Timeline of all bookings (past and future)
- Easy status updates
- Add new bookings

---

## Add/Edit Booking (Simple Form)

```
┌─────────────────────────────────────┐
│ Add Booking for Client A            │
├─────────────────────────────────────┤
│ Podcast Name: [________________] *  │
│ Host Name: [________________]       │
│ Podcast URL: [________________]     │
│                                     │
│ Scheduled Date: [Jan 15, 2025]     │
│                                     │
│ Status: [Booked ▼]                 │
│   • Booked (confirmed booking)      │
│   • In Progress (coordinating)      │
│   • Recorded (done, not live yet)   │
│   • Published (episode is live)     │
│                                     │
│ Recording Date: [___________]       │
│ Publish Date: [___________]         │
│ Episode URL: [___________]          │
│                                     │
│ Notes: [_____________________]      │
│        [_____________________]      │
│                                     │
│ ☑ Prep sent to client              │
│                                     │
│     [Cancel]  [Save Booking]        │
└─────────────────────────────────────┘
```

**That's it!** No complex podcast database. Just enter the podcast name and details when booking.

---

## Status Workflow

```
🟢 Booked
   ↓ (start prep/coordination)
🟡 In Progress
   ↓ (recording complete)
🔵 Recorded
   ↓ (episode goes live)
✅ Published
```

Or mark as:
❌ Cancelled (if booking falls through)

---

## What This System Does

### ✅ Calendar Overview
- See all clients and their monthly booking counts
- Color-coded status indicators
- Filter by year, month, or day
- Click any cell to see details

### ✅ Client Progress Tracking
- Each client has a profile with booking history
- See counts: booked, in progress, recorded, published
- Timeline view of all their podcasts
- Quick status updates

### ✅ Simple Booking Management
- Add booking: just enter podcast name + date
- Update status as you progress
- Track recording and publish dates
- Notes per booking

### ✅ Quick Stats
- How many total bookings this month
- How many clients have active bookings
- How many are booked vs in progress
- Upcoming this week

---

## What This System DOESN'T Do (And That's Fine)

❌ Track podcast analytics (which podcasts are best)
❌ Maintain a master podcast database
❌ Compare podcast performance
❌ Recommend podcasts to clients

**This is purely a client calendar and progress tracker.**

---

## Implementation Phases (Simplified)

### Phase 1: Database (1 hour)
- Run simplified migration
- Just 2 tables: clients + bookings
- Test with sample data

### Phase 2: Services (2-3 hours)
- `src/services/clients.ts` (CRUD)
- `src/services/bookings.ts` (CRUD)
- `src/services/calendar.ts` (calendar views)

### Phase 3: Calendar Dashboard (4-5 hours)
- Main calendar view (monthly grid)
- Stats cards
- Daily view option
- Click through to details

### Phase 4: Client Management (3-4 hours)
- Client list page
- Client detail page
- Add/edit client forms

### Phase 5: Booking Forms (2-3 hours)
- Add booking modal (simple form)
- Edit booking
- Quick status updates

### Phase 6: Polish (2 hours)
- Loading states
- Error handling
- Responsive design
- Testing

**Total: ~15-20 hours** (vs 25-37 with the complex system)

---

## Key Differences from Original Plan

| Original (Complex) | Simplified (What You Need) |
|-------------------|---------------------------|
| 3 tables (clients, podcasts, bookings) | 2 tables (clients, bookings) |
| Master podcast database | Just enter podcast name per booking |
| Podcast detail pages | No podcast pages needed |
| Podcast analytics | No analytics needed |
| Search/filter podcasts | Just search clients |
| 6-7 main pages | 3 main pages |
| 25-37 hours | 15-20 hours |

---

## Does This Match Your Vision?

This simplified system gives you:
- ✅ Calendar view of which clients have podcasts when
- ✅ Overall monthly booking counts
- ✅ Status tracking (booked → in progress → published)
- ✅ Click into each client for their progress
- ✅ Simple, fast, focused on what matters

No extra complexity around podcast databases you don't need.

**Sound good?** If so, I'll update the implementation guide and we can start building!
