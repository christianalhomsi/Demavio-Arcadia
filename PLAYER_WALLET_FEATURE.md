# Player Wallet Feature

## Overview
The player wallet feature allows hall owners and staff to create and manage wallets for players (both registered and guests) scoped per hall. Wallets can be topped up manually and used to pay for session costs with optional discounted pricing.

## Database Schema

### Tables Created

#### 1. `player_wallets`
Stores wallet records scoped per hall and player.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| hall_id | UUID | Reference to halls table |
| user_id | UUID (nullable) | Reference to profiles (for registered players) |
| guest_name | TEXT (nullable) | Name for guest players |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**Constraints:**
- Either `user_id` OR `guest_name` must be present
- Unique wallet per player per hall (UNIQUE on hall_id, user_id, guest_name)

#### 2. `wallet_transactions`
Transaction-based ledger for all wallet operations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| wallet_id | UUID | Reference to player_wallets |
| amount | DECIMAL(10,2) | Transaction amount |
| type | TEXT | 'top_up', 'deduction', or 'refund' |
| session_id | UUID (nullable) | Reference to session if deduction |
| added_by | UUID (nullable) | Staff who performed the transaction |
| note | TEXT (nullable) | Optional note |
| created_at | TIMESTAMPTZ | Transaction timestamp |

**Balance Calculation:**
Balance is ALWAYS calculated as the sum of all transactions:
- `top_up` and `refund` add to balance
- `deduction` subtracts from balance

#### 3. `hall_devices` (updated)
Added optional wallet pricing column.

| New Column | Type | Description |
|------------|------|-------------|
| wallet_price_per_hour | DECIMAL(10,2) (nullable) | Optional discounted rate for wallet payments |

If `wallet_price_per_hour` is NULL, falls back to `price_per_hour`.

#### 4. `invoices` (updated)
Added payment method tracking.

| New Column | Type | Description |
|------------|------|-------------|
| payment_method | TEXT | 'cash' or 'wallet' (default: 'cash') |
| wallet_transaction_id | UUID (nullable) | Reference to wallet transaction if wallet payment |

## API Endpoints

### GET `/api/wallets`
Get wallet balance for a player in a hall.

**Query Parameters:**
- `hall_id` (required): Hall UUID
- `username` (optional): Registered player username
- `guest_name` (optional): Guest player name

**Response:**
```json
{
  "id": "wallet-uuid",
  "hall_id": "hall-uuid",
  "user_id": "user-uuid",
  "guest_name": null,
  "balance": 50.00,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### POST `/api/wallets`
Top up a player's wallet.

**Request Body:**
```json
{
  "hall_id": "hall-uuid",
  "username": "ahmed123",  // OR guest_name
  "guest_name": "John Doe",
  "amount": 50.00,
  "note": "Initial top-up"
}
```

**Response:**
```json
{
  "id": "transaction-uuid",
  "wallet_id": "wallet-uuid",
  "amount": 50.00,
  "type": "top_up",
  "added_by": "staff-uuid",
  "note": "Initial top-up",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### POST `/api/sessions/[id]/end` (updated)
End session with optional wallet payment.

**Request Body:**
```json
{
  "hall_id": "hall-uuid",
  "rate_per_hour": 5.00,
  "payment_method": "wallet",  // 'cash' or 'wallet'
  "wallet_price_per_hour": 4.00  // optional discounted rate
}
```

## Payment Flow

### Option 1: Full Cash Payment
- Session cost (cash price) + all products = paid in cash
- `payment_method: 'cash'`
- No wallet deduction

### Option 2: Wallet + Cash (Mixed)
- Session cost paid from wallet (wallet price if set, otherwise cash price)
- All products paid in cash
- `payment_method: 'wallet'`
- Wallet balance is checked and deducted automatically
- Transaction is logged with session reference

## UI Integration

### Session Modal Updates
The session modal (`components/ui/session-modal.tsx`) now includes:

1. **Wallet Balance Display** - Shows current wallet balance if player has a wallet
2. **Dual Rate Input** - Cash rate (required) and optional wallet rate
3. **Payment Method Selection** - Two buttons:
   - "Full Cash" - Traditional payment
   - "Wallet + Cash" - Session from wallet, products in cash
4. **Smart Validation** - Disables wallet payment if insufficient balance
5. **Clear Breakdown** - Shows which costs are paid by which method

### Props Required
When opening the session modal, you must now pass:
- `userId: string | null` - For registered players
- `guestName: string | null` - For guest players

These are fetched from the session's reservation data.

## Player Types

### Registered Players
- Have a `user_id` in the profiles table
- Wallet identified by `hall_id + user_id`
- Can have different wallets in different halls

### Guest Players
- Walk-in customers created locally
- Have a `guest_name` in the reservation
- Wallet identified by `hall_id + guest_name`
- Can have different wallets in different halls

## Security & RLS Policies

### player_wallets
- Super admins: Full access
- Hall staff: Can manage wallets for their assigned halls
- Players: Can view their own wallets only

### wallet_transactions
- Super admins: Can view all transactions
- Hall staff: Can view transactions for their hall's wallets
- Players: Can view their own wallet transactions

## Helper Functions

### `get_wallet_balance(wallet_uuid UUID)`
SQL function that calculates current balance from all transactions.

```sql
SELECT get_wallet_balance('wallet-uuid');
-- Returns: 50.00
```

## Migration

Run the migration file:
```bash
supabase migration up supabase/add_player_wallets.sql
```

Or apply directly to your Supabase project via the SQL editor.

## Usage Examples

### 1. Top Up a Registered Player's Wallet
```typescript
const response = await fetch('/api/wallets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hall_id: 'hall-123',
    username: 'ahmed123',
    amount: 100.00,
    note: 'Monthly package'
  })
});
```

### 2. Top Up a Guest Player's Wallet
```typescript
const response = await fetch('/api/wallets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hall_id: 'hall-123',
    guest_name: 'Ahmed',
    amount: 50.00,
    note: 'Walk-in top-up'
  })
});
```

### 3. Check Wallet Balance
```typescript
const params = new URLSearchParams({
  hall_id: 'hall-123',
  username: 'ahmed123'
});
const response = await fetch(`/api/wallets?${params}`);
const wallet = await response.json();
console.log(wallet.balance); // 100.00
```

### 4. End Session with Wallet Payment
```typescript
const response = await fetch(`/api/sessions/${sessionId}/end`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hall_id: 'hall-123',
    rate_per_hour: 5.00,
    payment_method: 'wallet',
    wallet_price_per_hour: 4.00 // optional discount
  })
});
```

## Important Notes

1. **Balance is Never Stored** - Always calculated from transactions for full audit trail
2. **Products Always Cash** - Wallet only covers session cost, never products
3. **Automatic Deduction** - When wallet payment is selected, balance is deducted automatically
4. **Insufficient Balance** - API returns error if wallet balance < session cost
5. **Hall Scoped** - Same player can have different wallets in different halls
6. **Transaction Logging** - Every operation is logged with timestamp and staff reference

## Future Enhancements

Potential features to add:
- Wallet transaction history UI
- Bulk wallet top-ups
- Wallet expiration dates
- Wallet transfer between players
- Wallet refund functionality
- Wallet usage reports and analytics
- Auto top-up when balance is low
- Wallet packages (e.g., buy 10 hours get 1 free)
