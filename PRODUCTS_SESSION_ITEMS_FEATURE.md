# Products & Session Items Feature

## Overview
A complete product catalog and session items management system that allows hall owners to sell products (drinks, snacks, etc.) during gaming sessions and include them in the final invoice.

## Features

### 1. Product Catalog (Settings Page)
Hall owners can manage a catalog of sellable products:
- **Name**: Product name (e.g., "Coca Cola", "Chips")
- **Price**: Product price in dollars
- **Active/Inactive Status**: Soft delete - products are never removed from DB to preserve historical records
- **Multi-tenant**: Each hall sees only its own products

### 2. Session Items
During an active session, staff can add items to the session:
- **Product Reference**: Links to product catalog (nullable for manual entries)
- **Snapshot Fields**: Product name and price are saved at time of purchase
  - This ensures old invoices remain accurate even if product prices change later
- **Quantity**: Number of items purchased
- **Immediate Persistence**: Items are saved to DB immediately, not just local state

### 3. Double-Click Behavior
On the device overview page (staff view):
- **No Active Session**: Double-click does nothing
- **Active Session**: Double-click opens session modal with:
  - Session info (duration, elapsed time)
  - Quick-add buttons for active products from catalog
  - Current session items (cart)
  - Manual entry option for items not in catalog
  - Running total = session base cost + sum of session items
  - "Confirm Payment" button

### 4. Invoice Integration
When payment is confirmed:
- Session is marked as completed
- Final invoice includes:
  - Session base cost (hourly rate × duration)
  - All session items as line items
  - Grand total

## Database Schema

### Products Table
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  hall_id UUID REFERENCES halls(id),
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Session Items Table
```sql
CREATE TABLE session_items (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  product_id UUID REFERENCES products(id), -- nullable
  product_name TEXT NOT NULL,              -- snapshot
  product_price DECIMAL(10, 2) NOT NULL,   -- snapshot
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## API Endpoints

### Products
- `GET /api/products?hall_id=xxx` - Get all products for a hall
- `POST /api/products?hall_id=xxx` - Create new product
- `PATCH /api/products?product_id=xxx` - Update product

### Session Items
- `GET /api/session-items?session_id=xxx` - Get items for a session
- `POST /api/session-items` - Add item to session
- `DELETE /api/session-items?item_id=xxx` - Remove item from session

### Updated Endpoints
- `POST /api/sessions/[id]/end` - Now includes session items in total calculation

## Usage

### For Hall Owners (Settings Page)
1. Navigate to **Settings** page
2. Scroll to **Products** section
3. Click **Add Product**
4. Enter product name and price
5. Click **Add**
6. Products can be edited or deactivated (soft delete)

### For Staff (Device Overview)
1. Navigate to **Devices** page
2. Find device with active session
3. **Double-click** the device card
4. Session modal opens showing:
   - Session duration and elapsed time
   - Quick-add product buttons
   - Current cart (session items)
   - Manual entry option
   - Total breakdown
5. Add products by clicking quick-add buttons
6. Or add custom items using manual entry
7. Remove items by clicking trash icon
8. Enter rate per hour
9. Review total (session cost + items)
10. Click **Confirm Payment**

## Security

### RLS Policies
- **Products**: 
  - Super admins can manage all products
  - Staff/Managers can read products for their assigned halls
- **Session Items**:
  - Super admins can manage all session items
  - Staff/Managers can manage session items for their hall's sessions

### Access Control
- All API endpoints verify staff/manager access to the hall
- Products are scoped to halls (multi-tenant)
- Session items are validated against session ownership

## Technical Details

### Snapshot Pattern
Session items store a snapshot of product name and price at the time of purchase:
```typescript
{
  product_id: "uuid-123",        // Reference (can be null)
  product_name: "Coca Cola",     // Snapshot
  product_price: 2.50,           // Snapshot
  quantity: 2
}
```

This ensures:
- Historical accuracy: Old invoices show correct prices
- Data integrity: Product changes don't affect past transactions
- Flexibility: Manual entries (null product_id) are supported

### Total Calculation
```typescript
const sessionCost = ratePerHour × durationHours;
const itemsTotal = sum(item.product_price × item.quantity);
const grandTotal = sessionCost + itemsTotal;
```

## Files Created/Modified

### New Files
1. `supabase/add_products_and_session_items.sql` - Database migration
2. `types/product.ts` - Product types
3. `types/session-item.ts` - Session item types
4. `services/products.ts` - Product service functions
5. `services/session-items.ts` - Session item service functions
6. `app/api/products/route.ts` - Products API
7. `app/api/session-items/route.ts` - Session items API
8. `components/ui/session-modal.tsx` - Session management modal
9. `app/[locale]/dashboard/[hallId]/settings/products-section.tsx` - Products UI

### Modified Files
10. `services/index.ts` - Export new services
11. `app/api/sessions/[id]/end/route.ts` - Include session items in total
12. `components/ui/staff-device-card.tsx` - Add double-click handler
13. `app/[locale]/dashboard/[hallId]/settings/page.tsx` - Add products section
14. `messages/ar.json` - Arabic translations
15. `messages/en.json` - English translations

## Migration Steps

1. **Run SQL Migration**:
   ```sql
   -- Execute: supabase/add_products_and_session_items.sql
   ```

2. **Restart Development Server**:
   ```bash
   npm run dev
   ```

3. **Test the Feature**:
   - Add products in Settings
   - Start a session
   - Double-click device card
   - Add items to session
   - Confirm payment
   - Verify invoice includes items

## Future Enhancements
- Product categories
- Product images
- Inventory tracking
- Bulk product import
- Product analytics
- Discount/promotion system
- Print receipt with itemized list
