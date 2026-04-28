# Arcadia Logo

## 📁 Current Logo

**File**: `arcadialogo.png`

---

## 🎨 Usage in Code

### Import Logo Component
```tsx
import Logo from "@/components/ui/logo";

// Use in your component
<Logo href="/halls" size="sm" showText={true} />
```

---

## 📐 Available Sizes

| Size | Container | Image Size | Use Case |
|------|-----------|------------|----------|
| `xs` | 6-7 (24-28px) | 24px | Mobile nav, small headers |
| `sm` | 7-8 (28-32px) | 28px | Dashboard headers (default) |
| `md` | 9-11 (36-44px) | 36px | Page headers |
| `lg` | 14-16 (56-64px) | 56px | Login pages |
| `xl` | 20-24 (80-96px) | 80px | Hero sections |

---

## 🔧 Optimization Recommendations

### Current Format: PNG
✅ **Pros**: 
- Supports transparency
- Good quality
- Wide browser support

⚠️ **Cons**:
- Larger file size than SVG
- Not infinitely scalable

### Recommended: Convert to SVG
```bash
# Benefits of SVG:
✓ Infinitely scalable without quality loss
✓ Smaller file size
✓ Can be styled with CSS
✓ Better performance
```

### Tools for Conversion
- [Vectorizer.AI](https://vectorizer.ai/) - AI-powered PNG to SVG
- [Adobe Illustrator](https://www.adobe.com/products/illustrator.html) - Professional tool
- [Inkscape](https://inkscape.org/) - Free & open source

---

## 📦 File Specifications

### Recommended Specs
- **Format**: SVG (preferred) or PNG
- **Size**: Multiple sizes for different use cases
- **Transparency**: Yes (alpha channel)
- **Color Mode**: RGB
- **Resolution**: 72 DPI minimum (for PNG)

### Naming Convention
```
arcadialogo.svg          # Main SVG logo
arcadialogo.png          # PNG fallback
arcadialogo-icon.svg     # Icon-only version
arcadialogo-light.svg    # Light theme variant
arcadialogo-dark.svg     # Dark theme variant
```

---

## 🎯 Logo Variants (Future)

### Suggested Variants
1. **Full Logo** - Icon + Text
2. **Icon Only** - Just the symbol
3. **Wordmark** - Just "Arcadia" text
4. **Monochrome** - Single color version
5. **Inverted** - For dark backgrounds

---

## 🌐 Where Logo is Used

### Favicon
- Browser tab icon
- Bookmarks
- Mobile home screen

### Navigation
- Dashboard header
- Admin panel
- Mobile menu

### Authentication
- Login page
- Signup page
- Email templates

### Marketing
- Landing pages
- Social media
- Print materials

---

## 📱 Responsive Behavior

The logo automatically adjusts size based on screen width:

```tsx
// Mobile (< 640px)
<Logo size="sm" />  // 28px

// Tablet (640px - 1024px)
<Logo size="md" />  // 36px

// Desktop (> 1024px)
<Logo size="lg" />  // 56px
```

---

## 🎨 Brand Colors

### Primary Colors
- **Violet**: `oklch(0.55 0.26 280)` - #8B5CF6
- **Cyan**: `oklch(0.82 0.14 200)` - #22D3EE

### Usage in Text
```tsx
<span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
<span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
```

---

## 🔄 Updating the Logo

### Steps to Update
1. Add new logo file to this folder
2. Update filename in `components/ui/logo.tsx`
3. Update favicon in `app/[locale]/layout.tsx`
4. Test on all pages
5. Clear browser cache

### Code to Update
```tsx
// components/ui/logo.tsx
<Image
  src="/assets/images/logos/YOUR-NEW-LOGO.png"
  alt="Arcadia Gaming Hub Logo"
  ...
/>

// app/[locale]/layout.tsx
icons: {
  icon: '/assets/images/logos/YOUR-NEW-LOGO.png',
  ...
}
```

---

## ✅ Quality Checklist

- [ ] Logo is clear and recognizable
- [ ] Works on light and dark backgrounds
- [ ] Scales well at all sizes
- [ ] File size is optimized
- [ ] Transparency is preserved
- [ ] Colors match brand guidelines
- [ ] Accessible alt text provided

---

## 📞 Support

For logo design questions or updates, contact the design team.
