# Logo Implementation Guide

## 📋 Overview

تم تطبيق لوغو Arcadia في جميع أنحاء الموقع باستخدام مكون `Logo` قابل لإعادة الاستخدام.

---

## 🎨 Logo Component

### الموقع
```
components/ui/logo.tsx
```

### الاستخدام الأساسي

```tsx
import Logo from "@/components/ui/logo";

// Logo with link
<Logo href="/halls" size="sm" showText={true} />

// Logo without link
<Logo size="md" showText={false} />
```

---

## 📐 Sizes Available

### `xs` - Extra Small
- Container: `w-6 h-6 sm:w-7 sm:h-7`
- Image: 24px
- Text: `text-xs sm:text-sm`
- **Use case**: Small headers, mobile navigation

### `sm` - Small (Default)
- Container: `w-7 h-7 sm:w-8 sm:h-8`
- Image: 28px
- Text: `text-sm sm:text-base`
- **Use case**: Dashboard headers, navigation bars

### `md` - Medium
- Container: `w-9 h-9 sm:w-11 sm:h-11`
- Image: 36px
- Text: `text-base sm:text-lg`
- **Use case**: Page headers, prominent sections

### `lg` - Large
- Container: `w-14 h-14 sm:w-16 sm:h-16`
- Image: 56px
- Text: `text-lg sm:text-xl`
- **Use case**: Login pages, landing pages

### `xl` - Extra Large
- Container: `w-20 h-20 sm:w-24 sm:h-24`
- Image: 80px
- Text: `text-xl sm:text-2xl`
- **Use case**: Hero sections, splash screens

---

## 🔧 Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `href` | `string` | `"/halls"` | Link destination (optional) |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"sm"` | Logo size variant |
| `showText` | `boolean` | `true` | Show "Arcadia" text next to logo |
| `className` | `string` | `undefined` | Additional CSS classes |

---

## 📍 Implementation Locations

### ✅ Dashboard Header
```tsx
// components/layout/dashboard-header.tsx
<Logo href="/halls" size="sm" showText={true} />
```

### ✅ Admin Layout
```tsx
// app/[locale]/admin/layout.tsx
<Logo href="/admin" size="sm" showText={true} />
```

### ✅ Halls Page
```tsx
// app/[locale]/(dashboard)/halls/page.tsx
<Logo href="/halls" size="sm" showText={true} />
```

### ✅ Reservations Page
```tsx
// app/[locale]/(dashboard)/reservations/page.tsx
<Logo href="/halls" size="xs" showText={true} />
```

### ✅ Login Page
```tsx
// app/[locale]/auth/login/request-otp-form.tsx
<div className="p-4 rounded-2xl" style={{ background: "oklch(0.55 0.26 280 / 0.08)" }}>
  <Logo href="/" size="xl" showText={false} />
</div>
```

---

## 🌐 Favicon & Meta Icons

### Root Layout
```tsx
// app/[locale]/layout.tsx
export const metadata: Metadata = {
  title: { default: "Arcadia", template: "%s | Arcadia" },
  description: "Arcadia — Staff & Player Portal",
  icons: {
    icon: [
      { url: '/assets/images/logos/arcadialogo.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/images/logos/arcadialogo.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/assets/images/logos/arcadialogo.png',
    shortcut: '/assets/images/logos/arcadialogo.png',
  },
};
```

---

## 🎯 Design Features

### Design Features

### Responsive
- Logo size adapts to screen size using Tailwind breakpoints
- Text visibility controlled with `xs:` breakpoint
- Smooth transitions on hover (scale 1.05x)
- Duration: 300ms for smooth animation

### Image Optimization
- Uses Next.js Image component for automatic optimization
- Priority loading for large logos (lg, xl)
- Quality: 95 for crisp display
- Object-fit: contain to preserve aspect ratio
- Full width/height within container

### Text Gradient
- "Arc" → `oklch(0.55 0.26 280)` (violet)
- "adia" → `oklch(0.82 0.14 200)` (cyan)

---

## 📱 Mobile Optimization

### Text Visibility
```tsx
// Hidden on mobile, visible on xs+ screens
className="hidden xs:block"
```

### Responsive Sizing
```tsx
// Smaller on mobile, larger on desktop
w-6 h-6 sm:w-7 sm:h-7
```

---

## 🔄 Usage Examples

### Example 1: Navigation Bar
```tsx
<header className="flex items-center gap-3 px-5 h-14">
  <Logo href="/halls" size="sm" showText={true} />
  <div className="flex-1" />
  <nav>...</nav>
</header>
```

### Example 2: Login Page
```tsx
<div className="text-center mb-8">
  <div className="p-4 rounded-2xl inline-block" 
    style={{ background: "oklch(0.55 0.26 280 / 0.08)" }}>
    <Logo size="xl" showText={false} />
  </div>
  <h1>Welcome to Arcadia</h1>
</div>
```

### Example 3: Mobile Menu
```tsx
<div className="mobile-menu">
  <Logo href="/halls" size="xs" showText={false} />
</div>
```

### Example 4: Footer
```tsx
<footer>
  <Logo size="md" showText={true} />
  <p>© 2024 Arcadia Gaming Hub</p>
</footer>
```

---

## 🎨 Customization

### Custom Styling
```tsx
<Logo 
  size="md" 
  showText={true}
  className="opacity-80 hover:opacity-100"
/>
```

### Without Link
```tsx
<Logo 
  href={undefined}  // or don't pass href prop
  size="sm" 
  showText={true}
/>
```

---

## 📦 Logo Asset

### Current Logo
- **Path**: `/assets/images/logos/arcadialogo.png`
- **Format**: PNG
- **Recommended**: Convert to SVG for better scaling

### Optimization Tips
1. **Convert to SVG** for vector scaling
2. **Optimize PNG** using TinyPNG
3. **Provide multiple sizes** for different use cases
4. **Use WebP** for better compression

---

## 🚀 Future Improvements

### Suggested Enhancements
1. Create SVG version of logo
2. Add dark/light mode variants
3. Create animated logo for loading states
4. Add logo variations (icon-only, full, compact)

### Additional Sizes
```tsx
// Add to Logo component
"2xs": { container: "w-5 h-5", image: 16, text: "text-xs" },
"xl": { container: "w-20 h-20", image: 64, text: "text-2xl" },
```

---

## 📝 Best Practices

1. **Always use Logo component** instead of hardcoding
2. **Choose appropriate size** for context
3. **Consider mobile** - hide text on small screens if needed
4. **Provide alt text** for accessibility
5. **Use priority prop** for above-the-fold logos

---

## 🔍 Testing Checklist

- [ ] Logo displays correctly on all pages
- [ ] Favicon appears in browser tab
- [ ] Logo is responsive on mobile
- [ ] Hover effects work smoothly
- [ ] Links navigate correctly
- [ ] Logo loads quickly (optimized)
- [ ] Accessible alt text provided

---

## 📞 Support

For questions about logo implementation, contact the development team.
