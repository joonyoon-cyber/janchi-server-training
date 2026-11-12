# Open questions & assumptions to verify

The spec asks that anything missing or ambiguous in the reference material be
flagged instead of invented. This file lists every such point. Items marked
**assumption** are implemented in a specific way so the simulator works; please
confirm them on the real POS (or tell us the right behavior) and they will be
corrected.

## Missing reference material

| # | What | Current handling |
|---|------|------------------|
| 1 | **PATIO table layout.** No screenshot of the PATIO tab. | Tab exists; shows a "layout not provided" note and no tables. Send a photo of the PATIO tab to add it. |
| 2 | The two **unlabeled section tabs** (3rd and 5th) on the Dine-in screen. | Rendered blank like the photo; selecting them shows an empty floor. |
| 3 | **Modifier screen** (buttons with the small modifier icon: BIBIMBAP COLD/HOT, SOON TOFU, ULTIMATE W/ BEER). | **Assumption:** a simple popup lists choices taken from the customer menu (bibimbap: Beef/Chicken/Tofu/Vegetables/Spicy Pork; soon tofu: Assorted/Seafood/Vegetables; Ultimate beer: the 8 drafts). Layout and options unverified. Soon tofu spice level is not asked. |
| 4 | **Guest-count entry** when seating a table. | **Assumption:** tapping an empty table opens a number keypad, then goes straight to the order screen. |
| 5 | **Cash / credit-card dialogs** on the tender screen. | **Credit Card (confirmed by the restaurant):** the guest taps the card on the reader, then a merchant copy and a customer copy print. Implemented for the full balance; no card data is ever requested. **Assumption:** the slip layout (signature line on the merchant copy only), and that the reader charges the whole balance. Charging part of the balance (split cards) is not simulated yet. **Cash:** the amount received is typed in cents on the BLUU-style pad (1, 0, 0, 00 → 100.00), confirmed by the restaurant; the change is shown afterwards. The Exact / next-dollar / bill shortcut buttons above the pad are a simulator aid and may not exist on the real POS. The Gratuity keypad on the tender screen also enters cents. |
| 6 | Whether the check **closes automatically** when fully paid. | **Credit card (confirmed by the restaurant):** after the receipts print, the POS returns to the Dine-in screen; the check is closed and the table is free. **Cash (assumption):** pressing *Close* on the tender screen closes the paid check and frees the table. *Close* with a balance left goes back to the order screen. |
| 7 | **Void of an already-ordered item** and manager approval. | **Assumption:** *Void Line* and *Void / Edit* work on new and ordered lines; ordered lines ask for confirmation and are logged as voids. Manager PIN is an option in Settings, **off** by default. |
| 8 | Order screen **Close with unsent items**. | **Assumption:** asks for confirmation, then discards the unsent items. If nothing was ever ordered, the table is released. |
| 9 | **Cash / Credit Card / Tender with unsent items** on the order screen. | **Assumption:** shows "press Order first". The real POS might send automatically. |
| 10 | Floor-plan tile icon seen on **W6** (person/card icon). | Not reproduced; meaning unknown. |
| 11 | Floor-plan **amount** on a table tile. | **Assumption:** shown as the check balance including tax (the same number as Amount Due on the order screen). Not confirmed whether the real tile includes tax. |
| 12 | Gratuity base. | **Assumption:** the 15/18/20% shortcuts are calculated on the pre-tax subtotal. |
| 13 | Check number format (`10-021` … `10-034` on one day in the Tender list photo). | **Assumption:** `10-` + a 3-digit sequence starting at `10-001` in each simulator session. What the `10` means (terminal? day?) and when the sequence resets is unknown. |
| 14 | **Printing a check from Dine-in** (confirmed by the restaurant: tap the printer icon, badge turns from red to a green check, tap a table, its check prints). | Implemented. **Assumption:** print mode switches off after one check is printed, and tapping the icon again cancels it. The "Select a table to print its check" hint line is a simulator aid. |
| 15 | **Log-in keypad** (confirmed: every main-screen button asks for the employee's Log-in ID first; the logged-in employee becomes the server on new tables and Quick Serve orders). | Implemented. The simulator has one employee: the trainee, whose name and Log-in ID (default `1234`) are set in Settings. A wrong ID shows "Invalid Log-in ID." The real error message and whether IDs are masked on screen are not known. |
| 16 | **Tender list** (confirmed: main screen > Tender lists all open tables and takeout orders; selecting one shows its items on the right; Tender opens the same payment screen as Dine-in > Tender > table). | Implemented, sorted newest check first. **Assumptions:** takeout cards read `Take out(SERVER NAME)`; *Table Name* sorts by table; *Edit* opens the order screen; *My Order* shows only your checks. *Change Order Type*, *Server*, *Reprint Kitchen Memo*, *Check No Search* and *POS SEARCH* are disabled; *Eat in*, *Drive-Thru* and *Delivery* show no orders. |
| 17 | **Quick Serve** (confirmed: opens the order screen as a takeout order; paid later through main screen > Tender). | Implemented with the "Take out" header, the Takeout icon and the customer box in place of Assign Seat. **Assumptions:** *Order* and *Close* return to the main screen; a takeout order with nothing ordered is discarded; a paid takeout check returns to the main screen. |
| 18 | **Tip Adjustments** (confirmed: Search With Receipt Number → type the number → select the row → Credit Gratuity → type the tip from the signed slip → Ok → Print Receipt? prompt; any button returns to the results). | Implemented. Receipt number = date + check number digits (e.g. `2026110610025` for check 10-025), and searching by the trailing digits (`10025`) finds it. The gratuity keypad enters cents (2, 0, 00 → 20.00), confirmed by the restaurant. **Assumptions:** the list stays empty until a search or a *My Order* / *Tip Applied* / *Business Hours* filter is used; approval no., TroutD and the masked card digits are randomly generated. Cash / Offline C.C. / Flexgift Gratuity, Reprint, Search By Employee, Select Employee and the calendar are disabled. Whether a second Ok on an already-tipped payment replaces the tip is not known (the simulator replaces it). |
| 19 | **Even Amount Split** (confirmed: on a table's or takeout's tender screen, Even Amount Split asks "Please enter the number of customers", shows the split amounts, *Apply* returns to the tender screen, then each share is paid with Credit Card or Cash; leftover cents go to the first shares, e.g. 100.00 ÷ 3 = 33.34 / 33.33 / 33.33; each guest's tip is entered afterwards in Tip Adjustments, one row per card payment). | Implemented: each Cash / Credit Card payment takes the next unpaid share; each split card payment gets its own row in Tip Adjustments for its tip. **Assumptions:** the layout of the split-amounts window (no photo yet); splitting again replaces the shares; split card payments share the check's receipt number. |

## Buttons shown but disabled

These buttons look like the real POS. Pressing them shows a message saying they are not part of the simulator yet. They do **not** pretend to work:

Main screen: Quick Serve, Cashier In, Cashier Out, Tip Adjustments, Gift Card, Cash Drawer, Announcement, Operations, and the top-right icons.
Dine-in: Information, Move/Join, Link Table, Quick Serve, Cash Drawer, Refund.
Order screen: Split, Combine, Price Change, Discount, Input Customer Information, Kitchen Memo, Last Receipt, Assign Seat and its − / +, Select Cust.
Tender screen: Offline C.C., Gift Card, Total Amount, ︿ / ﹀, customer search.

Implemented on main / Dine-in / tender: **Recall** and **Tender** (main screen) list open checks; **Tender** on Dine-in lets you tap a table to tender it; **Order Sum** shows the check summary.

## Menu mapping questions

Full list in `src/data/menuMapping.json` (`status: "ambiguous"` or `"missing-in-pos"`).

* **Soju flavors:** menu lists Rich / Original / Saero / Citron / Grape; POS has RED / GREEN / ZERO SUGAR / LEMON / GREEN GRAPE. Mapped Rich→RED, Original→GREEN, Saero→ZERO SUGAR, Citron→LEMON, Grape→GREEN GRAPE. **Needs confirmation.** POS also has JINRO IS BACK, GRAPEFRUIT, MELON, which are not on the printed menu.
* **Chardonnay:** menu says *San Simon* ($12/$36); POS button says *CHAR. MADDALENA* ($12/$36).
* **Sauvignon Blanc:** menu says *Tierra del Fuego* ($10/$30); assumed to be *SAU.BL. HOUSE* ($10/$30).
* **Soju Slushie ($14) and Slushie + Coronita ($17)** are on the drinks menu but no POS button appears in the screenshots.
* **GARLIC&JALAPENO** (AYCE APPS): the label is cut off in the screenshot; spelled out here.
* **Ultimate included drink** (ULTIMATE W/ SODA / W/ BEER at $0.00): it's unclear whether servers also ring the actual soda or beer. Scenarios don't test this yet.
* **BEEF TONGUE 6oz / SCALLOP 8PCS** ($20 each, in AYCE MEAT): assumed to be add-ons. They count toward the 4-meat limit. Confirm.
* **Under-4 children** ("Under 4 years old Free"): no POS button, so not used in scenarios.
* POS-only buttons with no customer-menu item (extra sides, TOGO kimchi, EMPLOYEE DRINK, COCKAGE FEE, CREATOR / BIRTHDAY PROMO, ssamjang, etc.) are kept on the grid but are not used in scenarios.

## Policy questions

* **AYCE participation:** the printed AYCE menu says *"All party members at each table must order from the SAME AYCE menu choice and no exception."* The training spec says guests with disabilities are the exception. The simulator follows the spec and includes a scenario for it. **Please confirm with management**, since this conflicts with the printed menu.
* **Weekend lunch:** Premium lunch ($33.95) is "Monday–Friday, excluding Sat/Sun & holidays". The *Saturday Lunch Pricing* scenario expects **PREMIUM AYCE (DINNER)** at lunchtime on a Saturday. Confirm that this is how servers ring it.
* **18% gratuity, party of 5+:** listed under the AYCE rules. The simulator expects it on AYCE parties of 5+ only, entered by the server with *Gratuity* on the tender screen. Confirm whether the POS adds it automatically, and whether it also applies to à la carte parties.
* **Galbi limit:** "25. GALBI ONLY 1PC" (+$3.95) is limited to 1 per person. The evaluation flags more than one per guest.
* **Tax rate:** 7.25% reproduces both reference receipts exactly. It can be changed in Settings.
