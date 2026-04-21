# Device Pause Feature (Maintenance Mode)

## Overview
ميزة إيقاف الأجهزة مؤقتاً للصيانة - تسمح لمديري الصالات والموظفين بإيقاف أي جهاز مؤقتاً لمنع الحجوزات عليه (مثل وقت الصيانة أو الأعطال).

## Features Added

### 1. Device Status
- إضافة حالة جديدة: `paused` للأجهزة
- الحالات المتاحة الآن:
  - `available` - متاح
  - `active` - نشط
  - `idle` - محجوز
  - `offline` - غير متصل
  - `paused` - متوقف مؤقتاً (صيانة)

### 2. Pause Functionality
- يمكن إيقاف أي جهاز (متاح، نشط، محجوز) ما عدا offline
- عند الإيقاف:
  - الجهاز يصبح غير قابل للحجز
  - اللاعبون يشوفون رسالة "الجهاز قيد الصيانة"
  - الحجوزات الموجودة تبقى كما هي
- عند الاستئناف:
  - النظام يحدد الحالة الصحيحة تلقائياً:
    - `active` إذا فيه جلسة نشطة
    - `idle` إذا فيه حجز مؤكد
    - `available` إذا الجهاز فاضي

#### Staff Device Card
- زر Pause/Resume يظهر لجميع الأجهزة (ما عدا offline)
- موقع الزر: قبل زر "View Calendar"
- تنسيق برتقالي للتمييز
- أيقونة Pause ⏸️ للإيقاف / Play ▶️ للاستئناف

#### Player Device Card
- شارة برتقالية تظهر "Paused" للأجهزة المتوقفة
- رسالة "Device under maintenance" بدل زر الحجز
- لا يمكن فتح نافذة الحجز

### 3. UI Components

#### POST `/api/devices/pause`
إيقاف أو استئناف جهاز

**Request:**
```json
{
  "device_id": "uuid",
  "hall_id": "uuid",
  "paused": true  // true للإيقاف, false للاستئناف
}
```

**Response:**
```json
{
  "status": "paused"  // الحالة الجديدة
}
```

**Security:**
- يتطلب صلاحية staff أو manager
- يتحقق من ملكية الجهاز للصالة

#### POST `/api/reservations`
تم تحديثه لمنع حجز الأجهزة المتوقفة:
```json
{
  "error": "Device is currently paused for maintenance"
}
```

### 4. Translations

#### Arabic (ar.json)
```json
"paused": "متوقف مؤقتاً",
"pause": "إيقاف مؤقت",
"resume": "استئناف",
"devicePaused": "تم إيقاف الجهاز مؤقتاً",
"deviceResumed": "تم استئناف الجهاز",
"pauseFailed": "فشل إيقاف الجهاز",
"deviceUnderMaintenance": "الجهاز قيد الصيانة"
```

#### English (en.json)
```json
"paused": "Paused",
"pause": "Pause",
"resume": "Resume",
"devicePaused": "Device paused",
"deviceResumed": "Device resumed",
"pauseFailed": "Failed to pause device",
"deviceUnderMaintenance": "Device under maintenance"
```

### 5. Styling
تم إضافة تنسيق CSS جديد في `globals.css`:
```css
.badge-paused {
  @apply bg-orange-500/15 text-orange-400 border border-orange-500/30;
  box-shadow: 0 0 8px oklch(0.70 0.20 50 / 0.15);
}
```

## Usage

### For Hall Managers/Staff (إيقاف جهاز للصيانة)
1. افتح صفحة **Devices** (الأجهزة) في لوحة التحكم
2. اختر أي جهاز (متاح، نشط، أو محجوز)
3. اضغط على زر **"إيقاف مؤقت"** (Pause) - اللون البرتقالي
4. الجهاز يتوقف فوراً ويظهر للجميع كـ "متوقف مؤقتاً"
5. اللاعبون لن يقدرون يحجزوه
6. لاستئناف الجهاز، اضغط على **"استئناف"** (Resume)

### For Players (رؤية الأجهزة المتوقفة)
- الأجهزة المتوقفة تظهر بشارة برتقالية "Paused"
- رسالة "الجهاز قيد الصيانة" بدل زر الحجز
- لا يمكن حجز الجهاز حتى يستأنفه الموظف

### Use Cases (حالات الاستخدام)
- 🔧 **صيانة دورية**: إيقاف الجهاز لتنظيفه أو صيانته
- ⚠️ **عطل مؤقت**: إيقاف جهاز فيه مشكلة لحين إصلاحها
- 🎮 **تحديث ألعاب**: إيقاف الجهاز أثناء تثبيت تحديثات
- 🚫 **منع الحجز**: إيقاف جهاز معين لأي سبب إداري

## Technical Details

### Database
لا حاجة لتعديل قاعدة البيانات - الحقل `status` في جدول `devices` يدعم أي قيمة نصية.

### Files Modified
1. `services/devices.ts` - إضافة دالة setDevicePaused
2. `services/index.ts` - تصدير الدالة الجديدة
3. `components/ui/staff-device-card.tsx` - زر pause/resume لجميع الأجهزة
4. `components/ui/device-card.tsx` - منع حجز الأجهزة المتوقفة + رسالة صيانة
5. `app/api/devices/pause/route.ts` - **NEW** API endpoint للإيقاف/الاستئناف
6. `app/api/reservations/route.ts` - منع حجز الأجهزة المتوقفة
7. `app/globals.css` - تنسيق badge-paused
8. `messages/ar.json` - الترجمات العربية
9. `messages/en.json` - الترجمات الإنجليزية

## Security
- فقط المستخدمون الذين لديهم صلاحية `staff` أو `manager` يمكنهم إيقاف/استئناف الأجهزة
- يتم التحقق من صلاحية الوصول للصالة قبل تنفيذ الأمر
- يتم تسجيل جميع عمليات الإيقاف/الاستئناف في سجل التدقيق (Audit Log)
- اللاعبون لا يمكنهم حجز الأجهزة المتوقفة (حماية من API)

## Smart Resume
عند استئناف جهاز متوقف، النظام يحدد الحالة الصحيحة تلقائياً:
- إذا فيه جلسة نشطة → `active`
- إذا فيه حجز مؤكد قادم → `idle`
- إذا الجهاز فاضي → `available`

## Future Enhancements
- إضافة سبب الإيقاف (maintenance reason)
- إحصائيات عن مدة التوقف (downtime analytics)
- إشعارات للاعبين عند استئناف الجهاز
- جدولة الصيانة الدورية (scheduled maintenance)
