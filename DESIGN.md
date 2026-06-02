---
name: AI Work Calendar
description: "企业 AI 工作日历，日报、项目、风险与汇报在一张日历里闭环。"
colors:
  primary: "#0B57D0"
  primary-hover: "#1A73E8"
  primary-pressed: "#0847A6"
  primary-soft: "#D3E3FD"
  primary-bg: "#EEF5FF"
  ai: "#0F766E"
  ai-hover: "#14A39A"
  ai-soft: "#CCFBF1"
  ai-bg: "#ECFDF9"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#EE3B2B"
  ink: "#1A1A1A"
  text: "#424242"
  muted: "#737373"
  placeholder: "#737373"
  line: "#E6E6E6"
  page: "#F6F6F6"
  panel: "#FFFFFF"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: "2.5rem"
    letterSpacing: "0"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "0"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "0"
  ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "0"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "44px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  card-default:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  tag-default:
    backgroundColor: "{colors.primary-bg}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
---

# Design System: AI Work Calendar

## 1. Overview

**Creative North Star: "安静的团队工作控制台"**

AI Work Calendar is a dense but calm enterprise product interface. It should feel like a reliable daily operating surface for managers and employees: clear hierarchy, restrained color, legible tables, fast actions, and AI panels that explain what to do next.

The system rejects consumer promotion energy, decorative AI effects, traditional OA heaviness, and marketing-first app screens. Logged-in pages serve repeated work: scanning, entering, comparing, filtering, and deciding.

**Key Characteristics:**

- Dense enough for daily operations, never cramped.
- Blue marks primary action and navigation state.
- Teal marks AI insight, safety, and intelligent assistance.
- Warning and danger states are explicit, labeled, and action-oriented.
- Cards and panels support structure, not decoration.

## 2. Colors

The palette is a restrained enterprise system with one operational blue, one AI teal, semantic state colors, and quiet neutral surfaces.

### Primary

- **Operational Blue** (`primary`): Main buttons, selected navigation, key links, and current focus states.
- **Operational Blue Surface** (`primary-bg`, `primary-soft`): Active navigation backgrounds, selected calendar states, and soft primary emphasis.

### Secondary

- **AI Teal** (`ai`, `ai-hover`): AI insights, smart suggestions, safety messages, and AI-assisted actions.
- **AI Teal Surface** (`ai-bg`, `ai-soft`): Low-intensity AI panels and inline assistant surfaces.

### Tertiary

- **Work Success** (`success`): Submitted reports, completed states, healthy signals.
- **Attention Amber** (`warning`): Missing reports, approaching deadlines, waiting states.
- **Risk Red** (`danger`): Blockers, failures, destructive actions, and real project risks.

### Neutral

- **Ink** (`ink`): Page titles, key metrics, and primary text.
- **Body Gray** (`text`): Main readable copy and table body.
- **Muted Gray** (`muted`, `placeholder`): Secondary descriptions, labels, and readable input placeholders.
- **Line Gray** (`line`): Borders, table dividers, and panel separation.
- **Work Surface** (`page`, `panel`): Light gray app background with white panels.

### Named Rules

**The One Primary Action Rule.** A page should have one strong blue primary action at most. Secondary actions stay white with borders.

**The AI Role Rule.** Teal is reserved for AI, insight, security, and smart assistance. Do not use teal for ordinary primary buttons.

**The Risk Honesty Rule.** Red only means real risk, blocker, failure, or destructive action.

## 3. Typography

**Display Font:** system sans stack with SF Pro Text and PingFang SC fallback.
**Body Font:** the same system sans stack.
**Label/Mono Font:** no separate mono family in core UI.

**Character:** The type system is utilitarian and native-feeling. Weight, size, and spacing create hierarchy without decorative display fonts.

### Hierarchy

- **Display** (600, 2rem / 2.5rem): Product homepage and high-emphasis metrics only.
- **Headline** (600, 1.75rem / 2.25rem): Web app page titles and important admin screens.
- **Title** (600, 1.25rem / 1.75rem): Panel titles, modal titles, card headings.
- **Body** (400, 1rem / 1.5rem): Readable paragraphs, form help, and operational explanations.
- **UI** (400-600, 0.875rem / 1.25rem): Dense tables, controls, compact metadata, and toolbar copy.
- **Label** (600, 0.75rem / 1rem): Table headers, metric labels, chips, and compact status labels.

### Platform Notes

- **Web:** use fixed `rem` tokens. Do not use fluid type inside app, dashboard, or data grids.
- **iOS:** use Apple system typography with semibold titles. Core app roles: Page Title 30pt, Hero 28pt, Body 16pt, Support 15pt, Caption 12pt, Metric 28pt.

### Named Rules

**The Native Legibility Rule.** Use the system sans stack everywhere. Do not introduce decorative fonts into workflow surfaces.

**The No Negative Tracking Rule.** Letter spacing is `0` in app UI. Do not tighten Chinese or mixed Chinese-English labels.

**The Placeholder Contrast Rule.** Placeholder text uses `#737373`, not `#A3A3A3`, so login, search, and daily report inputs remain readable on mobile and desktop.

## 4. Elevation

The product uses a hybrid of tonal layering, thin borders, and very light shadows. Most structure comes from background contrast and borders; shadows are reserved for floating surfaces, cards that need separation, and modals.

### Shadow Vocabulary

- **Card Shadow** (`0 10px 28px rgba(26, 26, 26, 0.06)`): Low ambient separation for white cards on light gray backgrounds.
- **Float Shadow** (`0 24px 70px rgba(26, 26, 26, 0.14)`): Modals, drawers, and elevated overlays.

### Named Rules

**The Flat-By-Default Rule.** Tables, toolbars, and panels should rely on background and border first. Add shadow only when a surface floats above the page.

## 5. Components

### Buttons

- **Shape:** gently rounded operational controls (`10px` to `12px` radius).
- **Primary:** blue background, white text, 40px height, icon allowed when it clarifies the action.
- **Hover / Focus:** blue hover state and visible focus ring. Do not use decorative glow.
- **Secondary:** white background, gray border, ink text.
- **Danger:** red only for destructive actions, preferably with confirmation.

### Chips

- **Style:** pill radius (`999px`), light tinted background, semibold 12px to 13px text.
- **State:** every status chip must include text. Color alone is not enough.

### Cards / Containers

- **Corner Style:** app cards and panels use 16px radius.
- **Background:** white panels on light gray app background.
- **Shadow Strategy:** light card shadow only when border and background are insufficient.
- **Border:** `#E6E6E6` or equivalent subtle divider.
- **Internal Padding:** 16px for compact cards, 20px to 24px for larger panels.

### Inputs / Fields

- **Style:** white field, gray border, 10px to 12px radius, 40px height.
- **Focus:** primary blue border or ring.
- **Error / Disabled:** red error text for validation, neutral disabled background.

### Navigation

- **Style:** persistent app shell with left navigation on desktop and drawer navigation on mobile.
- **Active State:** primary blue text on soft blue background.
- **Labels:** short, functional Chinese labels such as `AI日历`, `AI整体分析`, `填报记录`, `AI汇报`, `项目`, `团队`.

### AI Insight Panels

AI panels must lead with a conclusion, then evidence or risk, then an action. Use teal for normal AI insight, warning for missing reports, and danger for blockers or failed work.

## 6. Do's and Don'ts

### Do:

- **Do** keep workflow screens dense, scannable, and calm.
- **Do** show AI outputs as conclusion, evidence, and next action.
- **Do** use blue for primary action and selected state.
- **Do** use teal only for AI, insight, security, and smart suggestions.
- **Do** keep mobile touch targets at least 44px.
- **Do** pair every status color with text or icon meaning.

### Don't:

- **Don't** use consumer promotion pricing patterns such as `19.9`, coupon badges, or livestream-style urgency.
- **Don't** use generic AI SaaS cliches: purple-blue gradients, glassmorphism, large decorative orbs, or vague "empower" copy.
- **Don't** make logged-in pages feel like marketing hero pages.
- **Don't** overload employees with enterprise setup, tenant code entry, or billing decisions.
- **Don't** use red for neutral emphasis. Red is only for risk, blocker, failure, destructive action, or deletion.
- **Don't** put cards inside cards unless the inner surface is a modal, repeated item, or functional tool.
