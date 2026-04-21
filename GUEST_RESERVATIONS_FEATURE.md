# Guest Reservations Feature

## Overview
This feature allows hall staff and managers to create reservations for walk-in guests directly from the device calendar view, without requiring the guest to have a user account in the system.

## Changes Made

### 1. Database Schema
- **File**: `supabase/add_guest_name_to_reservations.sql`
- Added `guest_name` column to `reservations` table
- Added constraint to ensure either `user_id` OR `guest_name` is present
- This allows reservations to be created for guests without user accounts

### 2. Backend Changes

#### Schema Update
- **File**: `schemas/booking.ts`
- Added optional `guest_name` field to booking schema

#### Service Layer
- **File**: `services/reservations.ts`
- Updated `createReservation` function to accept nullable `userId`
- Added support for `guest_name` in reservation creation

#### API Endpoint
- **File**: `app/api/reservations/route.ts`
- Added authorization check: only staff and managers can create guest reservations
- Uses `verifyHallManagementAccess` to ensure proper permissions
- When `guest_name` is provided, `user_id` is set to null

#### Type Definitions
- **File**: `types/reservation.ts`
- Already had `guest_name` field defined

### 3. Frontend Changes

#### Device Calendar View
- **File**: `components/ui/device-calendar-view.tsx`
- Added "Add Reservation" button in calendar footer
- Created new dialog for adding guest reservations
- Dialog includes:
  - Guest name input field
  - Time slot selector (shows only available future slots)
  - Validation and error handling
- Updated reservation display to show guest names
- Added automatic refresh after successful reservation creation

#### Translations
- **Files**: `messages/ar.json`, `messages/en.json`
- Added translations:
  - `devices.addReservation`: "إضافة حجز" / "Add Reservation"
  - `devices.guestName`: "اسم الضيف" / "Guest Name"
  - `devices.guestNamePlaceholder`: "أدخل اسم الضيف" / "Enter guest name"
  - `devices.selectTime`: "اختر الوقت" / "Select Time"
  - `devices.reservationAdded`: "تم إضافة الحجز بنجاح" / "Reservation added successfully"
  - `devices.adding`: "جاري الإضافة..." / "Adding..."

## How It Works

### User Flow
1. Staff/Manager opens device calendar view
2. Clicks "Add Reservation" button
3. Enters guest name
4. Selects available time slot (30 minutes)
5. Confirms reservation
6. Calendar automatically refreshes to show new reservation

### Authorization
- Only users with `hall_manager` or `hall_staff` role can create guest reservations
- Regular players cannot create guest reservations
- Authorization is enforced at the API level

### Display Logic
The calendar now shows three types of reservations:
1. **User Reservations**: Shows username from profiles table
2. **Guest Reservations**: Shows guest_name field
3. **Legacy Reservations**: Shows truncated user_id if no name available

## Database Migration

Run the following SQL migration on your Supabase database:

```sql
-- Add guest_name column to reservations table
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN reservations.guest_name IS 'Name of guest for walk-in reservations (when user_id is null)';

-- Update the check constraint to allow either user_id or guest_name
ALTER TABLE reservations 
DROP CONSTRAINT IF EXISTS reservations_user_or_guest_check;

ALTER TABLE reservations 
ADD CONSTRAINT reservations_user_or_guest_check 
CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);
```

## Testing Checklist

- [ ] Run database migration
- [ ] Test as hall manager: can create guest reservation
- [ ] Test as hall staff: can create guest reservation
- [ ] Test as regular player: cannot see "Add Reservation" button (or gets 403 error)
- [ ] Verify guest name appears in calendar view
- [ ] Verify guest name appears in reservations list
- [ ] Test overlap detection still works
- [ ] Test calendar refresh after adding reservation
- [ ] Test validation (empty guest name should fail)
- [ ] Test time slot selection (only future available slots)

## Future Enhancements

Potential improvements:
- Add phone number field for guest reservations
- Add guest history tracking
- Allow converting guest reservations to user reservations
- Add guest check-in flow
- Export guest reservation reports
