# Employee analytics (owner only)

The **Analytics** tab appears only for the owner account. It reads POS back-office exports
**in the browser**: nothing is uploaded, stored or sent anywhere, and closing the page clears it.

## Files to load (8 POS exports + the schedule)

Use the same date range for every file; the last 60–90 days works best. Each file is recognized by
the title in its first cell, so file names don't matter.

| Export | Used for |
|---|---|
| Time Card | Missed clock-outs, checks closed outside shifts, telling apart two people with the same first name |
| Detailed Sales List | Every item on every check: $0 / below-price items, AYCE downgrades, large parties, tips per check |
| Employee Tips | Cash vs card tips per person, and full names per check |
| Sales Record by Employee Date | Checks and cash/card sales per person per day (to compare people fairly) |
| Cancelled Order Details | Items removed after they were served |
| Void Detail | Paid checks voided (cash voids especially) |
| Sales Discount Report | Discounts, their notes, and discounts bigger than their label |
| Item Price Change History | Prices lowered or set to $0 |
| **Shift schedule** (your weekly schedule workbook, one tab per week) | Roles (only scheduled Servers are compared as servers), scheduled shifts for overstays, and on/off duty for employee discounts |

The schedule workbook is recognized by its layout: a "Name" column, a date above each day's Lunch and
Dinner columns, role groups in the first column (Server, F/R Busser, Host, Bartender). Times have no
AM/PM (`11:00-4:00` is 11 AM–4 PM, `4:00-9:00` is 4–9 PM), `C` means until close (10:00 PM Mon–Sat, 9:00 PM Sunday;
closers get 45 minutes for closing duties and are compared with the other closers that night), and a prefix like `H)` means that shift is worked as Host.

Not needed (the same data is in the files above): **Detailed Sales List 2**, **Sales Record by
Employee**, **Sales Record by Person Ordering**. The page recognizes and skips them.

## Checks

| Check | Looks for |
|---|---|
| Missed clock-outs | Shifts with no clock-out, over 14 hours, or ending on a later day (suggested clock-out: the scheduled end, else the person's usual time); very long shifts, accidental punches, overlaps, edits |
| Stayed past their shift | Clock-outs 15+ minutes after the scheduled end, early clock-ins, clocking back in after a shift, no clock-out between lunch and dinner, unscheduled shifts, scheduled shifts with no punch |
| Tips that may not reach the pool | Cash tips are counted on paper, so only card tips are used: card checks with no automatic 18% and a $0 tip (likely a cash tip: compare with the tip sheet), tips under 10%, median card tip %, card tips ÷ card sales; cash share of sales for context |
| Large parties without the 18% | 5+ AYCE dinners but fewer than 5 guests entered; parties of 5+ tipped under 17.5% |
| Items taken off after they were served | Items cancelled 20+ minutes after ordering; Ultimate switched to Premium; adult AYCE changed to a child price |
| Paid checks voided | Voided checks, with cash-paid ones in red |
| Discounts and the employee policy | **Off-duty 10%**: only employee + immediate family (parents, siblings, spouse, children), outside working hours, note "NAME RELATIONSHIP". **On-duty 20%**: only the employee's own food during their scheduled shift (flags: outside a shift, for someone else, alcohol/drinks, guest-sized dine-in checks). Also discounts with no reason or bigger than their button |
| Free or cheaper items | Price changes down, items rung at $0 or below their usual price, employee items rung in bulk |
| Bigger tips when something was free | Tip % on a server's checks with something free vs their other checks |
| Checks outside shifts and shared logins | Checks closed while the server wasn't clocked in; checks under shared logins |

**All flagged entries** lists every flagged entry from every check, worst first. **Look at one person**
shows everything for one employee: all their flags, where they differ from the team, and every entry
in the files (shifts vs schedule, checks served, day-by-day sales and tips for the tip sheet, discounts,
removed items, voids, price changes), with flagged entries highlighted.

**Who stands out** compares servers on every measure with a direction (robust z-scores: median and
MAD) and adds up how far above the team each person is. It is a pointer for where to look, not proof.

Code: `src/analytics/` (`xlsx.ts` reader, `reports.ts` parsers, `people.ts` name matching,
`checks.ts` checks, `AnalyticsPage.tsx` page). Tests with made-up data: `src/test/analytics.test.ts`.
