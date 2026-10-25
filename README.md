# Janchi POS Trainer

A browser-based training simulator for **Janchi Korean BBQ & Bar** (Thousand Oaks, CA).
It reproduces the restaurant's **BLUU Restaurant Pro 3.0** POS screens, so servers can practice
seating tables, ringing in AYCE and à la carte orders, fixing mistakes, and taking payment
before they work on the real terminal.

> The simulator runs entirely in the browser. It never talks to the live BLUU POS, the
> payment processor, or the kitchen printers, and it never asks for card numbers.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + simulation tests
npm run build      # static site in dist/ (works from any path, e.g. GitHub Pages)
```

## What's inside

**POS screens** (`src/pos/`). These are drawn on a fixed 1024×768 screen and scaled to fit, so
every button stays in the same place on desktop, tablet and phone:

* **Main:** Dine-in, Recall, Tender (and the other tiles, disabled).
* **Dine-in floor plan:** the *A B C BAR* and *M Y W* sections, with tables placed where they are in the photos. Tiles show the time seated, minutes elapsed, server, guest count and balance.
* **Order screen:** the 14 menu groups in the original order and colors, and every item button in its original row and column with its original POS label (e.g. `15. BRISKET AYCE`, `35. TOP SIRLON AYCE`). Order Details shows new lines in white and ordered lines shaded. Working buttons: Cancel All, − / +, Void Line, Qty, Void / Edit, Modifier, Order, Close, Cash, Credit Card, Tender.
* **Tender screen:** Cash (with change), Credit Card (simulated approval), Gratuity, Print (simulated receipt), Order Sum, Close. The summary shows Amount Due, Total Received and Balance.

**Practice Mode.** Free play with no scoring. The side panel searches the customer menu and shows
which POS group and button to use, plus the AYCE house rules. State is saved in the browser.

**Training Mode.** Guests speak in menu language, never in POS codes. 20 hand-written scenarios
across Beginner, Intermediate and Advanced, plus a **random scenario generator** for each level.
Scenarios cover:

* AYCE with drinks before, with, or after the meat order
* extra meat rounds and the 4-meat limit
* children's prices and the single-guest charge
* Ultimate AYCE and weekday vs. weekend lunch pricing
* à la carte and combo orders
* mid-order changes, cancellations before and after sending
* cash with change, credit card, and 18% gratuity
* two tables at once
* the AYCE participation policy

At the end you get a 0–100 score broken down by table, guest count, AYCE package, items and
quantities, AYCE compliance, order submission, modifications, payment, check closure, guest
interaction and time. It lists missing items, wrong quantities, AYCE violations and payment
mistakes, and gives suggestions. You can retry any scenario. Results are kept per browser.

The MVP scenario from the spec is **Beginner → "Premium AYCE Dinner (full table)"**.

## Data (all transcribed from the reference material in `docs/reference/`)

| File | Contents |
|------|----------|
| `src/data/posMenu.json` | 247 POS buttons: category, original label, item number, price, grid row/column, button color, meat-limit flag |
| `src/data/customerMenu.json` | 222 items from the printed menus (AYCE, appetizer, combo, lunch, dinner, drinks) |
| `src/data/menuMapping.json` | customer item → POS button, with aliases and `mapped` / `ambiguous` / `missing-in-pos` status |
| `src/data/tables.json` | table positions per section |
| `src/data/scenarios.json` | the hand-written training scenarios |

Anything that couldn't be confirmed from the screenshots or menus is listed in
**[`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md)**: missing PATIO layout, modifier screen,
ambiguous soju and wine names, the AYCE-exception policy, and others. Please review it.

## Tests

`npm test` checks the data (category order, grid positions, labels) and the tax math. The tax
reproduces both reference receipts: 84.90 → 6.16 and 89.80 → 6.51. It also checks that orders,
voids, payments and check closing behave correctly. A scripted "perfect server" then plays all 20
hand-written scenarios and 450 random ones through the same store actions the UI uses, and must
score 100 on each. Separate tests confirm that mistakes are caught: a 5-meat round, a wrong
quantity, the wrong payment method, and the wrong cash amount.

## Settings

Server name shown on the POS, sales tax rate (default 7.25%), and an optional manager PIN for
voiding ordered items. Whether the real POS requires a manager PIN for voids is not confirmed.
