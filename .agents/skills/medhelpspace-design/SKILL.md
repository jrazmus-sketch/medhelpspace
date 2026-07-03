---
name: medhelpspace-design
description: Design system guidelines and Tailwind CSS v4 patterns for rendering premium dark-theme interfaces and visual marketing assets for MedHelpSpace.
---

# MedHelpSpace Design System & UI Skill

This skill guides Antigravity (and other AI agents) in creating visual components, landing layouts, and marketing assets that conform to the premium MedHelpSpace aesthetic.

---

## 🎨 Visual Identity & Brand System

### 1. Typography Hierarchy
Always use the native project fonts defined in `layout.tsx`:
*   **Display Headers (Titles, Hero text):** `font-display` (`Bricolage Grotesque`). 
    *   *Usage:* Bold/Extrabold, tracking-tight (`tracking-[-0.03em]`), text-transparent clipping with gradients.
*   **Body Content (Forms, UI details, Labels):** `font-sans` (`Geist`).
    *   *Usage:* Regular/Medium, clean, high-readability line-height.
*   **Interactive Toggles / Code snippets:** `font-mono` (`Geist Mono`).

### 2. Colors & Shadows
The brand is built on a dark, high-end "glassmorphic" palette:
*   **Core Background:** `#030307` (almost pitch black with a slight violet-blue undertone).
*   **Primary Accent Purple:** `#7a1d91` / `#a855f7` (used for primary actions).
*   **Secondary Violet:** `#c084e8` (used for highlighting text and tags).
*   **Layer borders:** Thin, semi-transparent borders: `border border-white/[0.06]` or `border-purple-500/20`.
*   **Ambient Glow:** Radial gradients overlaying deep black backgrounds:
    ```css
    background: radial-gradient(circle at center, rgba(122, 29, 145, 0.2) 0%, rgba(3, 3, 7, 0) 70%);
    ```

---

## 💡 Visual Patterns

### 1. The Grid Overlay
For marketing assets and landing page blocks, overlay a subtle 40px grid pattern:
```css
background-image: 
  linear-gradient(rgba(192, 132, 232, 0.015) 1.5px, transparent 1.5px), 
  linear-gradient(90deg, rgba(192, 132, 232, 0.015) 1.5px, transparent 1.5px);
background-size: 40px 40px;
```

### 2. Glowing SVG Waves (The Heartbeat ECG)
Always style pulse lines with SVG blur filters to create a neon glowing sign look:
```xml
<defs>
  <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="5" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
<path d="..." class="stroke-[#c084e8] stroke-2" filter="url(#neon-glow)" />
```

### 3. Glassmorphic Pills & Containers
Pills should feel like floating glass segments:
```html
<span class="px-5 py-2 border border-white/[0.08] rounded-full text-sm font-sans font-semibold text-purple-200 bg-[#0f091f]/40 backdrop-blur-md shadow-lg">
  Pill Text
</span>
```

---

## 📱 Mobile-First Layout Rules
When designing layouts for this project:
1.  **375px/414px Widths:** Verify there is zero horizontal scroll, tap targets have at least 12px margins, and typography sizes scale down appropriately.
2.  **Calibration & Inputs:** Ensure select components utilize standard checkboxes or toggle controls that are easy to tap on smaller touch screens.
