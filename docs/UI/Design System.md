# Design System Specification: The Serene Interface

## 1. Overview & Creative North Star: "The Tactile Sanctuary"
This design system is engineered specifically for the high-intensity, long-duration environment of a Point of Sale (POS) system. Our Creative North Star is **"The Tactile Sanctuary."** Unlike traditional POS systems that rely on aggressive grids and stark contrasts, this system treats the interface as a physical workspace composed of high-quality organic materials like linen, stone, and frosted glass.

We break the "standard template" look by utilizing **intentional asymmetry** and **tonal depth**. The goal is to reduce cognitive load and eye strain through a "low-frequency" visual language—moving away from sharp digital edges toward soft, overlapping layers that feel curated rather than programmed.

---

## 2. Colors & Surface Philosophy
The palette avoids the "digital blue" fatigue common in retail. Instead, it utilizes a sophisticated range of warm neutrals and desaturated earth tones.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section off major areas of the UI. Boundaries must be defined through background color shifts or subtle tonal transitions. For example, a receipt sidebar should be differentiated from the product grid solely by moving from `surface` (#FCF9F4) to `surface-container-low` (#F6F3EE).

### Surface Hierarchy & Nesting
Treat the UI as a series of nested, physical layers. 
- **Base Layer:** `background` (#FCF9F4)
- **Primary Workspaces:** `surface` (#FCF9F4)
- **Interactive Containers:** `surface-container` (#F0EDE8)
- **Active/Floating Elements:** `surface-container-lowest` (#FFFFFF)

### The "Glass & Gradient" Rule
To elevate the experience, use **Glassmorphism** for floating overlays (e.g., payment modals or modifier drawers). Use a semi-transparent `surface` color with a `backdrop-filter: blur(20px)`. 

For Primary CTAs (like "Checkout"), move beyond flat fills. Use a **Signature Gradient**: 
`Linear-Gradient(135deg, primary #4E6359 0%, primary-container #8FA59A 100%)`. This adds a "soulful" depth that feels premium and tactile.

---

## 3. Typography: Editorial Clarity
We use **Manrope** for its geometric yet warm characteristics. The hierarchy is designed to prioritize "at-a-glance" readability without shouting.

- **Display (Large/Medium/Small):** Used for total amounts and key KPIs. These should feel authoritative.
- **Headline (Large/Medium/Small):** Reserved for section titles. Use `headline-sm` (1.5rem) for a sophisticated, editorial header feel.
- **Title & Body:** The workhorses of the POS. `body-lg` (1rem) is the default for line items to ensure legibility during fast-paced shifts.
- **Label:** Used for metadata (SKUs, timestamps). Use `label-md` in `on-surface-variant` (#424845) to create a clear distinction from primary data.

**Editorial Tip:** Use wider letter-spacing (0.02em) for `label` styles to enhance the premium, airy feel of the interface.

---

## 4. Elevation & Depth: Tonal Layering
We reject the heavy drop-shadows of the early 2010s. Depth is achieved through the **Layering Principle**.

- **Ambient Shadows:** When an element must "float" (like a dropdown), use a highly diffused shadow: `box-shadow: 0 12px 32px rgba(47, 49, 45, 0.06)`. Note the use of the charcoal text color (#2F312D) for the shadow tint—never use pure black.
- **The "Ghost Border" Fallback:** In high-density areas where color shifts aren't enough, use a **Ghost Border**: `outline-variant` (#C2C8C3) at **20% opacity**. It should be felt, not seen.
- **Roundedness Scale:** 
  - `md` (0.75rem) for standard buttons and cards.
  - `lg` (1rem) for main containers and modals.
  - `full` for search bars and status pills.

---

## 5. Components

### Buttons
- **Primary:** Utilizes the Sage Green gradient. Text is `on-primary` (#FFFFFF).
- **Secondary:** Surface-tinted. Background: `secondary-container` (#CFE2F1), Text: `on-secondary-container` (#536572). No border.
- **Tertiary:** Text only. Use `secondary` (#4E616D) with a subtle `surface-variant` hover state.

### Input Fields
Avoid the "box" look. Use a `surface-container-high` (#EBE8E3) background with a `sm` (0.25rem) bottom-only accent of the `primary` color when focused. This feels more like a sophisticated form and less like a generic database entry.

### Cards & Lists (The POS Feed)
**Strict Prohibition:** No horizontal dividers between line items. 
- Separate items using **Spacing Scale** (16px vertical gaps).
- For selected items, shift the background to `primary-fixed` (#D1E8DC) rather than drawing a thick border.

### Context-Specific: The "Soft-Touch" Keypad
For the numerical entry, use `surface-container-lowest` (#FFFFFF) for the keys on a `surface-container` background. The subtle 1-step shift in tone creates a tactile "button" feel without needing shadows or lines.

---

## 6. Do’s and Don’ts

### Do
- **Do** use whitespace as a functional tool. A restful interface needs room to breathe.
- **Do** use the `secondary-accent` (Dusty Blue) for non-critical information like "Customer Loyalty Status" to distinguish it from the "Action" Sage Green.
- **Do** ensure all touch targets are at least 48px to accommodate the "Tactile Sanctuary" philosophy.

### Don't
- **Don't** use pure #000000 or #FFFFFF. It causes "haloing" and eye fatigue over an 8-hour shift.
- **Don't** use standard 1px borders. If you find yourself reaching for a border tool, try a color shift first.
- **Don't** use neon status colors. Use our desaturated Status palette (e.g., #C98A80 for errors) to communicate urgency without inducing panic.