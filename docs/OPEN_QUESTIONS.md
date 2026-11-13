# Open questions & confirmed behavior

The spec asks that anything missing or ambiguous in the reference material be
flagged instead of invented. **Still open** lists what the simulator currently
guesses. **Confirmed** records answers from the restaurant (Nov 2026), so they
are not asked again.

## Still open

| # | Question | What the simulator does now |
|---|----------|-----------------------------|
| 1 | **Modifier for ULTIMATE W/ BEER**: what choices appear? | A one-tap list of the 8 drafts (guess). Soon tofu and bibimbap modifiers are confirmed (below). |
| 2 | **Even Amount Split result window**: exact layout. | A list of "Customer N: amount" with Cancel / Apply. Close enough for now. |
| 3 | **Voiding an item already sent to the kitchen**: manager PIN? Void Line or Void / Edit? | Both buttons work; sent lines ask for confirmation. Manager PIN is an option in Settings, off by default. |
| 4 | **Unlabeled 3rd and 5th section tabs** on the Dine-in screen. | Shown blank; selecting one shows an empty floor. |
| 5 | **Tender list Edit button**: opens the order screen? | Opens the order screen. |
| 6 | **Sauvignon Blanc**: is the menu's *Tierra del Fuego* the SAU.BL. HOUSE button? | Mapped to SAU.BL. HOUSE (same prices: $10 / $30). |
| 7 | **AYCE exception for guests with disabilities**: the original spec makes it an exception to "everyone does AYCE"; the restaurant's rule of thumb (below) does not mention it. | One advanced scenario still treats it as an exception. Remove it if there is no such exception. |
| 8 | **BAR seats**: how many guests per BAR seat? | Not scored: any party may sit at the bar. |
| 9 | **Joining W tables on the real POS**: Move/Join or Link Table? | Seating 5–8 guests at a W table automatically joins it with its pair (W1&2, W3&4, W5&6) if the pair is free; the tiles show "W4 with W3". |

Not worried about (intentionally not simulated): PATIO layout, the icon on table W6, card slip layout, physical gift card activation.

## Confirmed

**Ordering and menu**
* Everyone at a table does AYCE or everyone orders à la carte; AYCE tables can still add à la carte items. Not enforced by the POS; servers enforce it.
* Weekend lunch rings **PREMIUM AYCE (DINNER)**; the lunch price is Mon–Fri only.
* **25. GALBI ONLY 1PC** (+$3.95): 1 per person, not enforced by the POS. Training flags more than one per guest.
* **BEEF TONGUE 6oz / SCALLOP 8PCS** ($20): paid add-ons; they do **not** count toward the 4-meat limit.
* Ultimate's included drink: ring only **ULTIMATE W/ SODA** or **ULTIMATE W/ BEER** ($0.00), not the actual drink.
* Children under 4: ring nothing.
* Tax rate: 7.25%.
* Soju: 20% alcohol → RED, Original → GREEN, Zero Sugar → ZERO SUGAR, Citron → LEMON, Grape → GREEN GRAPE.
* Chardonnay: guests ask by grape when there is one kind; the POS button is CHAR. MADDALENA.
* Soju slushies are on **page 2 of KOREAN WINE**: (MANGO) SOJU SLUSHIE 14.00, (STRAWBERRY) SOJU SLUSHIE 14.00, +7oz CORONITA 3.00 (slushie + Coronita = 17). The item grid's `< 1 >` navigator pages through items.
* GARLIC&JALAPENO is the full label. Servers serve these AYCE items themselves: RICE, GREEN SALAD, RICE PAPER, GARLIC&JALAPENO, SESAME OIL, BEAN PASTE SSAMJANG, MISO SOUP, SEAWEED SOUP, SPICY MISO STEW (noted in Practice help).
* Modifiers: **soon tofu** asks spice (NO SPICY / MILD / MEDIUM / SPICY / VERY SPICY) and protein (ASSORTED / BEEF / SEAFOOD / VEGI); **bibimbap** asks protein (BEEF / CHICKEN / TOFU / VEGI / SPICY PORK). All $0.00.
* Gift certificates: Quick Serve → ▼ under the menu groups → CERTIFICATE (the only group on page 2) → Open Price pad (cents) → Tender. Not taxed; no kitchen prompt. Physical card activation is done by hand.

* **Void** is only for fixing the server's own entry mistakes (wrong item or quantity sent), not for things guests no longer want. Guests point out an item they didn't order right after it is sent; items are scored on what is on the check at the end, so voiding the mistake and ringing the right item earns the points back.
* **Ultimate tables** order Ultimate items (AYCE ULTIMATE: galbi, beef tongue, scallops, spicy tuna biscuit, japchae).
* **Table sizes**: A, B, Y3–Y5 seat up to 4; C, M, Y1–Y2 up to 6; W tables 4 each, or up to 8 when W1&2, W3&4 or W5&6 are used together. In Scenarios and the Test, seating a party at a table that is too small (or outside the section) is refused with the guest's or host's pushback and costs 2 points; so is opening a table's check before the guests ask for it. Free Play has no restrictions.

**Screens and buttons**
* **Log-in**: every main-screen button asks for a Log-in ID. For now any ID is accepted and the server is named after it (123 → SERVER123). Authorization will be discussed later.
* Seating: tap an empty table, enter the guest count.
* Order screen **Close** with unsent items: they are discarded without asking; nothing is saved or sent.
* **Tender / Cash / Credit Card before Order**: "Print Kitchen Order?" Yes / No; the items are sent either way. *No* for items that need no ticket (macarons).
* **Credit card**: tap on the reader; merchant and customer copies print; the POS returns to Dine-in.
* **Cash**: type the amount in cents (1, 0, 0, 00 → 100.00); no shortcut buttons. The change window has Close and also disappears by itself after a few seconds; a fully paid check then closes and the POS returns to Dine-in (main screen for takeout).
* Manual **Gratuity** button on the tender screen: usually never used; disabled in the simulator.
* **18% tip**: added automatically on the pre-tax subtotal for dine-in parties of 5+, AYCE or à la carte, not takeout (128.40 → 23.11). Split payments divide it equally (Pre Gratuity in Tip Adjustments).
* **Even Amount Split**: number of customers → amounts → Apply → pay each share by card or cash; leftover cents go to the first shares. Each guest's tip is entered later in Tip Adjustments.
* **Tip Adjustments**: list stays empty until a search; Search With Receipt Number → row → Credit Gratuity → tip (cents) → Print Receipt? → back to results. Entering a tip again replaces it. Split card payments share a receipt number but show different last-4 digits.
* **Printer icon** on Dine-in: tap (red → green check), tap a table, its check prints, the badge turns red again.
* Floor-plan table amount: balance including tax.
* Check numbers `10-NNN` restart daily on the POS; in the simulator they restart each training scenario and each Practice reset.
* **Tender list**: all open tables and takeout orders; takeout cards read `Take out(SERVER NAME)`.
* **Quick Serve**: takeout order; pay later from main screen > Tender.

## Buttons shown but disabled

These look like the real POS but show a "not part of the simulator yet" message:

Main screen: Cashier In, Cashier Out, Gift Card, Cash Drawer, Announcement, Operations, and the top-right icons.
Dine-in: Information, Move/Join, Link Table, Quick Serve, Cash Drawer, Refund.
Order screen: Split, Combine, Price Change, Discount, Input Customer Information, Kitchen Memo, Last Receipt, Assign Seat and its − / +, Select Cust.
Tender screen: Offline C.C., Gift Card, Gratuity, Total Amount, ︿ / ﹀, customer search.
Tender list: Change Order Type, Server, Reprint Kitchen Memo, Check No Search, POS SEARCH.
Tip Adjustments: Cash / Offline C.C. / Flexgift Gratuity, Reprint, Search By Employee, Select Employee, calendar.
