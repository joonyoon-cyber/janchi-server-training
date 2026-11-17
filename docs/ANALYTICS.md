# Employee analytics (owner only)

The **Analytics** tab appears only for the owner account. It reads POS back-office exports
**in the browser**: nothing is uploaded, stored or sent anywhere, and closing the page clears it.

## Files to export (8)

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

Not needed (the same data is in the files above): **Detailed Sales List 2**, **Sales Record by
Employee**, **Sales Record by Person Ordering**. The page recognizes and skips them.

## Checks

| Check | Looks for |
|---|---|
| Missed clock-outs | Shifts with no clock-out, over 14 hours, or ending on a later day (with a suggested clock-out time); very long shifts, accidental punches, overlaps, edits |
| Tips kept out of the pool | Cash tips entered vs what the person's card tip rate suggests; cash and card checks closed with a $0 tip |
| Large parties without the 18% | 5+ AYCE dinners but fewer than 5 guests entered; parties of 5+ tipped under 17.5% |
| Items taken off after they were served | Items cancelled 20+ minutes after ordering; Ultimate switched to Premium; adult AYCE changed to a child price |
| Paid checks voided | Voided checks, with cash-paid ones in red |
| Discounts | No reason, family/friends notes, discounts bigger than their label |
| Free or cheaper items | Price changes down, items rung at $0 or below their usual price, employee items rung in bulk |
| Bigger tips when something was free | Tip % on a server's checks with something free vs their other checks |
| Checks outside shifts and shared logins | Checks closed while the server wasn't clocked in; checks under shared logins |

**Who stands out** compares servers on every measure with a direction (robust z-scores: median and
MAD) and adds up how far above the team each person is. It is a pointer for where to look, not proof.

Code: `src/analytics/` (`xlsx.ts` reader, `reports.ts` parsers, `people.ts` name matching,
`checks.ts` checks, `AnalyticsPage.tsx` page). Tests with made-up data: `src/test/analytics.test.ts`.
