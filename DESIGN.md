# Command Center Design System

The look: crisp, dense but breathable, keyboard-first. Layered surfaces instead
of boxes inside boxes. Neutral ink on calm surfaces, with each business's brand
color used sparingly as an accent. Reference points: Linear, Vercel, Raycast.

Everything below is mandatory for any UI in this repo. If a pattern is missing,
add a primitive to `components/ui/` rather than hand-rolling classes in a panel.

## 1. Color tokens (never use `zinc-*` + `dark:` pairs for surfaces or text)

Semantic colors are defined in `app/globals.css` and swap automatically in dark
mode. One class covers both themes.

| Use | Class | Replaces (old pattern) |
|---|---|---|
| App background | `bg-shell` | `bg-zinc-100 dark:bg-zinc-950` |
| Main content surface | `bg-canvas` | page-level `bg-white dark:bg-zinc-950` |
| Cards, modals, inputs, popovers | `bg-raised` | card-level `bg-white dark:bg-zinc-950` |
| Subtle fills, wells, group headers | `bg-sunken` | `bg-zinc-50 dark:bg-zinc-900`, `bg-zinc-100 dark:bg-zinc-900` |
| Row / ghost-button hover | `hover:bg-hover` | `hover:bg-zinc-50 dark:hover:bg-zinc-900/50` |
| Hairline border, dividers | `border-line`, `divide-line` | `border-zinc-200 dark:border-zinc-800`, `divide-zinc-100 dark:divide-zinc-900` |
| Stronger border (inputs, secondary buttons) | `border-line-strong` | `border-zinc-300 dark:border-zinc-700` |
| Primary text | `text-ink` | `text-zinc-900 dark:text-zinc-100` |
| Secondary text | `text-ink-2` | `text-zinc-600/700 dark:text-zinc-300/400` |
| Muted text, meta, icons | `text-ink-3` | `text-zinc-500`, `text-zinc-400 dark:text-zinc-600` |
| Placeholder, disabled, decorative only | `text-ink-4` | `text-zinc-300/400` placeholders |
| Primary button | `bg-inverse text-on-inverse` | `bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900` |
| Business accent | `text-brand`, `bg-brand text-on-brand`, `bg-brand-soft`, `border-brand` | `business.accent`, `business.tabActive`, inline hex |

`brand` only resolves inside a `.brand-scope` (the business workspace sets it).
Status hues (emerald, amber, red, blue, violet, sky) are allowed only through
`<Badge tone>` or for small semantic icons/text such as an overdue date
(`text-red-600 dark:text-red-400`) or money (`text-emerald-600 dark:text-emerald-400`).

Shadows: `shadow-card` (resting cards, buttons), `shadow-lift` (hover/drag),
`shadow-pop` (modals, palette, toasts). Do not use Tailwind's default `shadow-*`.

## 2. Shape and type

- Radius scale: `rounded-md` chips and badges, `rounded-lg` buttons, inputs,
  rows, nav items, `rounded-xl` cards, `rounded-2xl` modals, sheets, canvas.
  Do not use bare `rounded` or mix other sizes.
- Type scale: `text-xl font-semibold tracking-tight` page title,
  `text-[15px] font-semibold` modal title, `text-[13px] font-semibold text-ink`
  section title, `text-sm font-medium text-ink` row title, `text-[13px]` body
  and controls, `text-xs text-ink-3` meta. Minimum size is 12px; 11px is
  allowed only inside badges, counters, and keyboard hints. Never 10px.
- No ALL-CAPS tracking-wider labels. Field labels and group labels are
  sentence case, `text-xs font-medium`.
- Numbers that change or align get `tabular-nums`.
- Icons: lucide, 13 to 15px inline, `text-ink-3` unless active.
- Copy: never use em dashes or en dashes in UI text. Use a period, comma, or
  "to". Use sentence case for buttons and titles ("New lead", not "New Lead").

## 3. Primitives (`components/ui/`)

```tsx
import { Button, IconButton } from "@/components/ui/button";
import { Input, Textarea, Select, PrefixInput, SearchInput, Field, FieldGroup, inputClass, textareaClass } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { confirmDialog, toast } from "@/components/ui/host";
import { Badge, BrandTile, Card, EmptyState, Kbd, SectionHeader } from "@/components/ui/display";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
```

- `<Button variant="primary|secondary|ghost|danger|brand" size="sm|md|lg" loading>`.
  One primary button per view (the main create action). Default is `secondary`.
  Default `type="button"`; pass `type="submit"` inside forms.
- `<IconButton label="…">` for icon-only actions. `label` is required (it is the
  tooltip and the aria-label).
- `<Field label="Company" required hint="…">` wraps every form control. No
  unlabeled inputs anywhere. Use `<PrefixInput prefix="$">` for money and
  `<SearchInput>` for toolbar search. For controls made of buttons
  (`Segmented`, pill pickers, chip editors) use `<FieldGroup label>` instead:
  `Field` is a `<label>` and would forward label clicks to the first button.
- `<Select>` is a styled native select. Use `<Segmented>` instead when there
  are 2 to 5 short options (stage, priority, status, type, view toggle).
- `AutoTextarea` (components/auto-textarea.tsx) stays the control for notes;
  give it `className={textareaClass}`.
- `<Modal open onClose title description footer size onSubmit>` is the only
  modal. Bottom sheet on phones, centered dialog on desktop, Esc and backdrop
  close, sticky header and footer. Pass `onSubmit` so Enter submits and a
  `type="submit"` button in `footer` works. Footer layout: destructive action
  on the left (`<Button variant="danger">`), Cancel (`ghost`) and Save
  (`primary`) on the right. Never build a `fixed inset-0` overlay by hand.
- `confirmDialog({ title, description?, confirmLabel?, destructive? })` returns
  `Promise<boolean>`. `window.confirm`, `alert`, and `prompt` are banned.
- `toast(message, { tone?: "success" | "error", action? })` for feedback after
  copy, save failures, bulk results, and undo offers. Prefer an Undo toast over
  a confirm for cheap, reversible actions.
- `<Badge tone="neutral|blue|green|amber|red|violet|sky|inverse">` for every
  status, stage, category, and count chip.
- `<Card>` groups rows: `<Card><div className="divide-y divide-line">…</div></Card>`.
- `<SectionHeader title count hint action>` above a group.
- `<EmptyState icon title body action>` for every empty list. Always offer the
  next step as the action.

## 4. Panel anatomy

```tsx
<div>
  {/* Toolbar: what you're looking at on the left, the one primary action on the right */}
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div className="text-[13px] text-ink-3">
      <span className="font-medium text-ink tabular-nums">5</span> active
    </div>
    <Button variant="primary" onClick={…}><Plus size={14} /> New lead</Button>
  </div>

  <SectionHeader title="Upcoming" count={3} />
  <Card>
    <div className="divide-y divide-line">
      <button className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover">…</button>
    </div>
  </Card>
</div>
```

- The workspace already provides page padding and a centered readable column.
  Panels must not add outer padding, `max-w-*`, or `min-h-screen`.
- Rows: `px-4 py-3`, title on the first line, one line of `text-xs text-ink-3`
  meta under it, badges inline after the title, trailing value or actions on
  the right. Row-level actions that are secondary appear on hover on desktop
  (`md:opacity-0 md:group-hover:opacity-100`) and are always visible on touch.
- Creating and editing both happen in a `<Modal>` with the same form. No inline
  gray form boxes pushed into the page. Exception: single-field quick adds
  (todos) stay inline.
- Search and filters sit in the toolbar's left side. Any list that can exceed
  ~15 rows gets a search `<Input>` with a leading search icon.
- Spacing between groups: `space-y-6`.
- Loading states use `<Button loading>` or a `Loader2` spinner, never a text
  change alone.

## 5. Data rules (these fix real bugs, do not skip)

- A panel's main dataset must use the panel cache so edits survive tab
  switches: `const [leads, setLeads] = usePanelState("leads", initial);`
  (from `@/lib/panel-cache`). Keys: `initiatives`, `todos`, `leads`, `events`,
  `outreach`, `brands`, `resources`, `notes`, `chat`, `members`. Pass the
  server prop itself as `initial`, never a filtered or mapped copy.
- After creating, completing, reopening, or deleting a todo, call
  `refreshNav()` from `@/lib/ui-events` so the sidebar counts update.
- Deep links: panels accept `openId?: number` (open that record's editor, or
  select/scroll to it, on mount and whenever `openId` changes) and
  `autoNew?: boolean` (open the create form on mount).
- All fetches keep using `useShareHeaders()` exactly as they do today. Do not
  change any API route, request shape, or business logic while restyling.
- Optimistic updates are good. When a request fails, roll back and
  `toast("Could not …", { tone: "error" })`.

## 6. Do not

- Add a dependency. (Drag and drop uses native HTML5 events.)
- Use `safe-bottom` on an element that has its own bottom padding (it replaces
  padding). Use `pb-safe-3/4/10`.
- Put `flex-1` on an `AutoTextarea`.
- Hard-code hex colors, except `BrandTile` and `brandVars()`.
- Leave any `dark:` variant on a neutral surface or text color. If you are
  typing `dark:bg-zinc-…` or `dark:text-zinc-…`, use a token instead.
