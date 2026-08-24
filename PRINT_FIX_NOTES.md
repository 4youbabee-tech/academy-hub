# Academy Hub Desktop print regression fix

## Root cause
`src/lib/receipt-print.ts` and salary receipt printing use `window.open("", "_blank")` to create an `about:blank` print document and then call `window.print()`.

The current Electron hardening in `desktop/main.mjs` denied **all** renderer-created windows through `webContents.setWindowOpenHandler()`. As a result, the print window was denied and `window.open()` returned no usable window, so the UI appeared to do nothing when the print icon was pressed.

## Fix
`desktop/main.mjs` now allows only the tightly-scoped internal `about:blank` print popup. HTTPS links continue to open externally, every other popup remains denied, and the print child itself is prevented from opening further windows or navigating away from `about:blank`.

This restores both:
- Student receipt printing (`src/lib/receipt-print.ts`)
- Salary receipt printing (`src/routes/employees.tsx`)

No database, schema, licensing, or financial logic was changed.

## Validation performed
- `node --check desktop/main.mjs` — PASS

A new Windows installer must be built from this patched source before testing on the customer PC.
