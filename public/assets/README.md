# Assets Folder Structure

## 📁 Directory Organization

```
public/
└── assets/
    └── images/
        ├── logos/          # Brand logos and app icons
        ├── icons/          # UI icons and custom graphics
        └── backgrounds/    # Background images and patterns
```

---

## 📂 Folder Descriptions

### `/logos`
Store all brand-related logos and app icons:
- Main Arcadia logo (light/dark variants)
- Favicon assets
- App store icons
- Social media logos

**Recommended formats:** SVG, PNG (with transparency)

**Naming convention:**
- `arcadia-logo.svg`
- `arcadia-logo-light.svg`
- `arcadia-logo-dark.svg`
- `favicon-32x32.png`

---

### `/icons`
Store custom UI icons and graphics:
- Gaming device icons
- Status indicators
- Custom illustrations
- Feature icons

**Recommended formats:** SVG, PNG

**Naming convention:**
- `icon-{name}.svg`
- `device-ps5.svg`
- `status-active.svg`

---

### `/backgrounds`
Store background images and patterns:
- Hero section backgrounds
- Card backgrounds
- Gradient overlays
- Texture patterns

**Recommended formats:** WebP, PNG, JPG

**Naming convention:**
- `bg-{name}.webp`
- `hero-gradient.webp`
- `pattern-dots.png`

---

## 🎨 Image Optimization Guidelines

### File Formats
- **SVG**: For logos, icons, and vector graphics
- **WebP**: For photos and complex images (best compression)
- **PNG**: For images requiring transparency
- **JPG**: For photos without transparency

### Size Recommendations
- **Logos**: Max 200KB
- **Icons**: Max 50KB
- **Backgrounds**: Max 500KB (use WebP)
- **Hero Images**: Max 1MB (use WebP)

### Responsive Images
Consider providing multiple sizes:
- `image-mobile.webp` (640px)
- `image-tablet.webp` (1024px)
- `image-desktop.webp` (1920px)

---

## 🔧 Usage in Next.js

### Using Next.js Image Component

```tsx
import Image from 'next/image';

// Logo
<Image
  src="/assets/images/logos/arcadia-logo.svg"
  alt="Arcadia Logo"
  width={120}
  height={40}
  priority
/>

// Background
<Image
  src="/assets/images/backgrounds/hero-gradient.webp"
  alt=""
  fill
  className="object-cover"
  quality={90}
/>

// Icon
<Image
  src="/assets/images/icons/device-ps5.svg"
  alt="PS5"
  width={24}
  height={24}
/>
```

### Using as CSS Background

```tsx
<div 
  className="hero-section"
  style={{
    backgroundImage: 'url(/assets/images/backgrounds/hero-gradient.webp)'
  }}
>
  {/* Content */}
</div>
```

---

## 📝 Best Practices

1. **Always optimize images** before adding them
   - Use tools like TinyPNG, Squoosh, or ImageOptim
   
2. **Use descriptive names**
   - ✅ `arcadia-logo-dark.svg`
   - ❌ `img1.svg`

3. **Provide alt text** for accessibility
   - Logos: "Arcadia Gaming Hub Logo"
   - Decorative: "" (empty string)

4. **Use WebP format** for modern browsers
   - Provide fallback for older browsers

5. **Lazy load images** below the fold
   - Use `loading="lazy"` attribute

6. **Set explicit dimensions** to prevent layout shift
   - Always provide `width` and `height`

---

## 🚀 Image Optimization Tools

- **Online**: 
  - [TinyPNG](https://tinypng.com/) - PNG/JPG compression
  - [Squoosh](https://squoosh.app/) - WebP conversion
  - [SVGOMG](https://jakearchibald.github.io/svgomg/) - SVG optimization

- **CLI**:
  ```bash
  # Install sharp-cli
  npm install -g sharp-cli
  
  # Convert to WebP
  sharp -i input.jpg -o output.webp
  
  # Resize image
  sharp -i input.jpg -o output.jpg --resize 1920
  ```

---

## 📊 Current Assets

### Logos
- [ ] Main Arcadia logo
- [ ] Favicon (multiple sizes)
- [ ] App icon

### Icons
- [ ] Gaming device icons
- [ ] Status indicators
- [ ] UI icons

### Backgrounds
- [ ] Hero section background
- [ ] Card patterns
- [ ] Gradient overlays

---

## 🔄 Adding New Assets

1. Optimize the image using recommended tools
2. Choose appropriate folder (`logos`, `icons`, or `backgrounds`)
3. Use consistent naming convention
4. Update this README if adding new categories
5. Test image loading in development

---

## 📞 Support

For questions about asset management, contact the development team.
