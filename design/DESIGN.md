---
name: TriRide
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e5'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3fe'
  surface-container: '#ededf9'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e1e2ed'
  on-surface: '#191b23'
  on-surface-variant: '#434655'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fb'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#784b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#996100'
  on-tertiary-container: '#ffeedd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ed'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  button:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  nav-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  margin-mobile: 16px
  margin-desktop: 24px
  gutter: 16px
---

## Brand & Style
The design system is anchored in high-utility minimalism, prioritizing speed of task completion and clarity of information. It targets a dual audience: tech-savvy students and active tricycle drivers. The aesthetic is professional and clean, drawing inspiration from modern logistics and hospitality interfaces to evoke a sense of reliability and safety.

By utilizing a flat design approach with subtle depth, this design system ensures that the interface remains unobtrusive during high-stress booking moments. The visual language is structured, dependable, and approachable, stripping away unnecessary ornamentation to focus on the essential "utility" of transportation.

## Colors
The palette is built on a foundation of "Utility Blue" and "Trust Emerald." The primary blue is used for core actions and navigation, while the secondary emerald highlights success states and driver availability. 

The neutral palette uses cool slates for background and surfaces to maintain a crisp, modern feel. Contrast ratios are strictly enforced to ensure readability for users in outdoor environments with varying light conditions. Secondary text uses a softer slate to create a clear information hierarchy without sacrificing legibility.

## Typography
This design system utilizes **Inter** for its exceptional legibility on mobile screens. The hierarchy is designed to guide the eye from "where I am" (Headlines) to "what I need to know" (Body) and finally "what I need to do" (Button).

Headlines use tighter letter spacing and heavier weights to feel impactful and authoritative. Body text maintains standard spacing for maximum readability during transit. Use `nav-label` exclusively for bottom navigation components to ensure icons and text form a cohesive unit.

## Layout & Spacing
The layout follows a strict 8-point grid system. On mobile, content is contained within a fluid container with 16px side margins. 

Vertical spacing should scale by 8px increments. Use 16px (md) for most internal component padding and 24px (lg) to separate major content sections. This generous use of whitespace ensures that touch targets are easily accessible, crucial for drivers who may be interacting with the device while parked.

## Elevation & Depth
Depth is conveyed through a combination of tonal layering and soft, ambient shadows. In this design system, most surfaces remain flat against the background using a 1px border (#E2E8F0). 

Elevated elements like Cards and Bottom Sheets utilize a "Diffusion Shadow": a very soft, low-opacity (8-10%) shadow with a large blur radius to make the element feel as if it is floating slightly above the map or background. This creates a clear physical metaphor for interactive layers without the heaviness of traditional skeuomorphism.

## Shapes
The shape language is characterized by "Soft Geometry." Standard UI elements use a 12px (0.5rem) radius. Large containers like Cards use 16px (1rem), and significant structural elements like Bottom Sheets or large feature sections use 20px (1.25rem) on top corners.

This tiered approach to roundedness creates a friendly, modern feel that contrasts with the "rigid" nature of the city streets and maps found within the application.

## Components

### Buttons
- **Primary:** Solid #2563EB with White text. 12px roundedness. High-emphasis.
- **Secondary:** Solid #10B981 with White text. Used for "Success" or "Confirm" actions.
- **Outlined:** 1px border (#E2E8F0) with Primary text. Used for secondary actions like "Cancel" or "Edit."
- **Danger:** Solid #EF4444 with White text. Reserved for "Cancel Trip" or "End Ride."

### Inputs & Search
- **Search Bar:** 12px roundedness, #F1F5F9 background, with a subtle 1px border. Includes an icon prefix and clear button suffix.
- **Input Fields:** 12px roundedness, #FFFFFF background, 1px border (#E2E8F0). Active state uses a 2px Primary Blue border.

### Feedback & Overlays
- **Bottom Sheets:** 20px top-only roundedness. Always includes a drag handle. Used for ride details and driver profiles.
- **Status Badges:** Pill-shaped (fully rounded) with 10% opacity backgrounds of the status color (e.g., Success Green background at 10% with 100% Green text).
- **Bottom Tab Bar:** Fixed height (64px-72px), white surface, 1px top border (#E2E8F0). Uses active state indicators with Primary Blue.

### Cards
- **Standard Card:** 16px roundedness, white surface, subtle 1px border. Use for ride history items or driver information. Apply the "Diffusion Shadow" when the card is meant to be the primary focus of a screen.