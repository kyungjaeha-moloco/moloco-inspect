# Migration Status

> Component migration tracker. Reference material for design-team discussions.
> **Baseline**: code review of the Tving app (`apps/tving/`) as of 2026-04-13.

---

## MCButton → MCButton2 migration

### Status

| Version | Tving file count | Share | State |
|---------|------------------|-------|-------|
| **MCButton2** (new) | 115 files | 88% | Current standard |
| **MCButton** (legacy) | 15 files | 12% | Legacy |

### Props mapping

| MCButton (legacy) | MCButton2 (new) | Notes |
|-------------------|------------------|-------|
| `variant="contained"` | `variant="basic"` | Renamed |
| `variant="text"` | `variant="text"` | Same |
| `variant="icon"` | — | Removed; needs separate implementation |
| `color="primary"` | `color="primary"` | Same |
| `color="secondary"` | `color="secondary"` | Same |
| `color="danger"` | `color="error"` | Renamed |
| `color="default"` | `color="tertiary"` | Renamed |
| — | `loading={boolean}` | **New** — CircularLoader + auto-disabled |
| `leftIcon={<ReactNode>}` | `leftIcon="icon-name"` or `{<ReactNode>}` | **Extended** — accepts an icon-name string |

### What MCButton2 improves

1. **Built-in `loading` prop** — overlays a CircularLoader and auto-disables while loading.
2. **String icon names** — `leftIcon="check"` automatically renders `<MCIcon icon="check">`.
3. **Size-aware icon sizing** — large/default=16px, small=12px.
4. **Direct color-primitive references** — skips the indirect theme layer for more predictable styling.

### What MCButton2 doesn't support yet

1. **No `icon` variant** — icon-only buttons need their own implementation.
2. **`text` variant is primary-only** — secondary, tertiary, and error styles aren't defined for `text`.

### Where the legacy MCButton still lives (Tving)

All remaining usages are **legacy Order-related code**:

| Area | File count |
|------|-----------|
| Order creative setup (AuctionOrder) | 4 |
| Order containers (Order Container) | 5 |
| Order forms (LineItemSettingPanel, creative) | 2 |
| Targeting (MCKeyValuesForm) | 1 |
| Tracking links | 1 |
| Order comments | 1 |
| User settings (APIAccess) | 1 |

### Open questions

- [ ] Schedule for the bulk MCButton → MCButton2 swap.
- [ ] Replacement for the `icon` variant — a dedicated MCIconButton component?
- [ ] Whether to extend the `text` variant to secondary / error colors.

---

## Deprecated component migration

### Status (Tving baseline)

| Deprecated | Replacement | Tving usage | Migration |
|------------|-------------|-------------|-----------|
| **MCLoader** | MCCircularLoader | **0 files** | Done |
| **MCSelect** | MCFormSingleRichSelect | **0 files** | Done |
| **MCDatePicker** | MCFormDateRangePicker | **0 files** | Done |
| **MCModal** | MCCommonDialog | **18 files** | Pending |

### MCModal residue (18 files)

**Key insight**: `MCModalFormDialog` (the shared wrapper) is what actually uses MCModal — the other 17 files use MCModal indirectly through it.
→ **Migrating just MCModalFormDialog resolves all 18 files.**

| Area | File count | Notes |
|------|-----------|-------|
| **Creative forms** | 6 | Image, Video, NativeVideo, PauseAds, SplashAds, OutstreamAds |
| **Containers (Create)** | 5 | PublisherTarget, AudienceTarget, AdAccountCustomerSet, PublisherCustomerSet, Creative |
| **Targeting forms** | 3 | PublisherTargetForm, AudienceTargetForm, FormCustomAudienceSet |
| **Modal-form shared** | 2 | MCModalFormDialog, MCModalFormCreateGuide |
| **Auction order** | 1 | AuctionOrderCampaignForm |
| **Customer set** | 1 | CustomerSetForm |

### Why each migration

| Old → New | Reason |
|-----------|--------|
| MCLoader → MCCircularLoader | Full-screen loading → inline / partial loading support |
| MCSelect → MCFormSingleRichSelect | Native HTML select → search, multi-select, custom options |
| MCDatePicker → MCFormDateRangePicker | Single date → range selection + Formik integration |
| MCModal → MCCommonDialog | react-modal (external dep) → in-house implementation, consistent styling |

### Open questions

- [ ] Schedule for MCModal → MCCommonDialog (starting from MCModalFormDialog).
- [ ] When the library drops the `deprecated` exports (v4.0.0?).
- [ ] Whether MCModal removal lets us drop the react-modal dependency entirely.

---

## Brand color correction

### Change log

| Item | DS docs (previous) | Library (actual) | State |
|------|---------------------|--------------------|-------|
| Brand / Accent | `#6360DC` (purple) | `#346bea` (blue, BLUE[500]) | **Corrected** — see tokens.md |

Library source: `packages/ui/src/theme/color/primitives.ts` → `BLUE['500']`
Foundation mapping: `palette.foundation.assent` → `#346bea`

### Confirmed

- [x] Production brand color is `#346bea` (confirmed with engineering).
- [ ] Whether a future brand-color change is planned (unknown).

---

## DS docs to complete

### Done

- [x] Component layer structure documented (architecture.md)
- [x] Wrapper pattern documented (architecture.md)
- [x] MCButton vs MCButton2 comparison (migration-status.md)
- [x] Deprecated component status (migration-status.md)
- [x] Brand color correction (migration-status.md)

### Backlog

- [ ] Update tokens.json `#6360DC` → `#346bea` if still present.
- [ ] Document the full color-primitive scale (900–50).
- [ ] Verify typography numerics (H1=34px, H2=28px, H3=18px, H4=16px, H5=14px).
- [ ] Document MCFormLayout's `bodyWidth` and `fullScreen` options in detail.
