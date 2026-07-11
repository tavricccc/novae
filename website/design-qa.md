# Design QA

- source of truth: live app at `C:/Users/tavri/projects/novae`
- coded mock: `src/modules/mock-interface.js` + `src/styles/interface.css`
- reference viewports: desktop board (~1280+); mobile bottom-nav shell (~360)
- state: proposal board, public issues, active tab, admin-visible columns

## Alignment pass (2026-07-11)

Compared mock against:

| Real app | Token / value used in mock |
| --- | --- |
| `AppShell` header | `4rem` height, nav `text-sm` / `font-medium`, underline active |
| `IssueBoardTable` columns | `6rem 8rem 1fr 8rem 9rem 7rem 2.5rem` |
| `IssueTableRow` desktop | `text-sm` title, `text-xs` time/progress, avatar `h-7 w-7` |
| `VoteButtons` compact | `h-8`, total support count (not 0/1) |
| `BoardControls` | title `text-2xl`, category `text-sm`, segmented `min-h-10`, add `h-9 w-9` |
| Mobile row | status + avatar + title; secondary time + count + actions |
| Bottom nav | floating pill, 5 columns, label `11px` bold |

### Fixes applied

1. **Typography scale** — mock was ~9–11px; now uses app rem scale (`.75rem` / `.875rem` / `1.5rem` title).
2. **Column tracks** — switched from fixed px grids to the same rem tracks as `tableCols`.
3. **Header cells** — each column header is its own grid child so labels line up with body cells.
4. **Support button** — shows total count and toggles ±1 like `useVoteSupport`, not a fake 0/1 badge.
5. **Hero preview** — scales a full-size desktop board (`transform: scale`) instead of a separate under-sized stylesheet that broke proportions.
6. **Mobile chrome** — page title sits in a 3.5rem header bar (as in `AppShell`); board tools match mobile controls.

## Remaining limitations

- Static HTML mock cannot reproduce sliding nav underline, popovers, or infinite scroll.
- Font metric differences between Tabler icons and Lucide-based `AppIcon` may leave ±1px icon optical offset.
- No browser screenshot gate in CI; visual check is manual against the running app.

final result: proportions rebased on novae source tokens
