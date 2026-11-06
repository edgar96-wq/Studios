# Ledger Studio — how to classify transactions (for Atlas)
Version 1.1, 2026-11-06 · for Ledger Studio build 7 and later · give Atlas this whole file when it prepares bank or card statements.

## The job
Edgar downloads a statement (CSV) from his bank or card. Atlas returns **the same CSV with four columns added**, so Ledger Studio
files each row by itself instead of putting it in "To review". Edgar imports it in Ledger: Books → **Import statement (.csv)**.

## Hard rules
1. **Same rows, same values.** One output row per bank row. Keep `Date`, `Description` and `Amount` (or `Debit`/`Credit`) **exactly** as the
   bank wrote them: no cleaning, no rounding, no merging, no splitting, no new rows. Ledger recognises a transaction by date + amount + description;
   when they match a row already in Ledger that is still waiting for review, that row is **updated** (this is how the current "To review" pile gets cleared).
   Otherwise the row is added.
2. **Money direction.** Amount below 0 (or a Debit) = money out → an expense category. Above 0 (or a Credit) = money in → `survey-pay`,
   `other-income` or `transfer`. A category that doesn't match the direction is ignored and the row goes to review.
3. **Never guess.** When unsure, give your best category with `confidence` = `check`. Only `high` rows are filed without Edgar looking.
4. **Privacy.** No account numbers, card numbers or other people's personal details in `note`.

## The four columns to add
| Column | What to put |
|---|---|
| `line` | A category key from the table below (preferred). Ledger also understands the category name or a Schedule C line number, but keys are exact. |
| `job` | The job number (work order) when the row clearly belongs to one, e.g. `B-177608`, `O-155343`, `2610.0193`. Otherwise empty. |
| `note` | A short reason, only when it helps: who/why for a meal, "full phone bill: business share?"… Otherwise empty. |
| `confidence` | `high` = file it. `check` = Edgar decides; your category is shown as the suggestion. |

## Categories
| `line` (key) | Category in Ledger | Schedule C | Use it for | Example merchants |
|---|---|---|---|---|
| `survey-pay` | Survey work (paid by the companies) | line 1 | Deposits from the survey companies that hire Edgar (M.E. Land Surveying, OnlineLand Surveyors, LandMark, Target) | ZELLE FROM M E LAND SURVEYING |
| `other-income` | Other business income | line 1 | Other money earned by the business that is not survey pay |  |
| `transfer` | Not income (transfer, refund, card payment) | not counted | Money in that is not earned: transfers between his own accounts, credit-card payments, refunds, returns, reversals | ONLINE TRANSFER FROM SAV, PAYMENT THANK YOU |
| `field-supplies` | Field supplies (lath, flagging, paint, stakes) | line 22 | Lath, flagging, paint, stakes, nails, batteries, markers for fieldwork | HOME DEPOT, LOWES |
| `tools` | Tools & small equipment | line 22 | Tools and small equipment under $2,500 each (tripod, prism pole, hammer, tape) | HARBOR FREIGHT |
| `safety-gear` | Safety gear & work boots | line 22 | Safety vests, hard hats, work boots used only for fieldwork | BOOT BARN, RED WING |
| `phone` | Phone & internet (business share) | line 25 | Phone and internet: the business share only | VERIZON, T-MOBILE |
| `software` | Software & apps | line 27a | Software and app subscriptions used for the business (CAD, survey apps, cloud storage, AI tools) | ADOBE, AUTODESK, ANTHROPIC, X.AI |
| `dues` | Dues & memberships | line 27a | Professional memberships and association dues | FSMS, NSPS |
| `training` | Training & courses | line 27a | Courses, seminars, continuing education for his current work | UDEMY, PPI2PASS |
| `bank-fees` | Bank & payment fees | line 27a | Bank service charges, wire fees, payment-app fees | MONTHLY SERVICE FEE |
| `other` | Other business expense | line 27a | A real business expense that fits no other category |  |
| `insurance` | Business insurance (liability) | line 15 | Business liability insurance (not car, not health) | HISCOX, NEXT INSURANCE |
| `tolls` | Parking & tolls | line 9 | Parking and tolls on business trips | SUNPASS, PARKMOBILE |
| `meals` | Meals (50% deductible) | line 24b | Business meals with a client or co-worker (who and why go in the note) | DEES DINER (with a client) |
| `office` | Office supplies & postage | line 18 | Paper, ink, printing, postage, shipping | STAPLES, USPS |
| `tax-prep` | Tax prep & accounting | line 17 | Tax preparer, bookkeeping, tax software | TURBOTAX, H&R BLOCK |
| `licenses` | Licenses, permits & business taxes | line 23 | Sunbiz annual report, county business tax receipt, permits, professional licenses | SUNBIZ, CHARLOTTE COUNTY TAX |
| `repairs` | Equipment repairs | line 21 | Repairs to his work equipment (not the car) |  |
| `travel` | Travel away overnight | line 24a | Hotel and travel on work trips that keep him away overnight |  |
| `vehicle` | Fuel & vehicle costs (covered by mileage) | not deducted | Fuel, car repairs, car wash, tires, car insurance, registration: already covered by the mileage rate | SHELL, RACETRAC, GEICO, JIFFY LUBE |
| `personal` | Personal – not business | not deducted | Anything personal: groceries, family, home, entertainment, personal shopping | PUBLIX, NETFLIX |

## How to decide
- **Survey pay:** deposits from M.E. Land Surveying, OnlineLand Surveyors, LandMark or Target → `survey-pay`, `high`. If the deposit text shows a work-order
  number, put it in `job`. Edgar is a 1099 contractor: this is his business income, not a paycheck.
- **Not income:** transfers between his own accounts, credit-card payments ("PAYMENT THANK YOU", "AUTOPAY"), refunds, returns, reversals → `transfer`, `high`.
- **The car:** fuel, repairs, oil changes, tires, car wash, car insurance (GEICO, Progressive…), registration → `vehicle`, `high`. Ledger deducts the car by
  mileage (GPS trips), which already covers these; filing them anywhere else would count them twice.
- **Parking and tolls** (SunPass…) → `tolls`, `high`: deductible on top of the mileage.
- **Phone/internet:** usually shared with personal use → `phone`, `check`, note "full bill: business share?".
- **Meals:** only with a client or co-worker for work → `meals` with who/why in `note`; if you can't tell → `check`. Everyday food → `personal`.
- **Mixed stores** (Amazon, Walmart, Costco, Target *store* purchases): you usually can't see what was bought → best guess, `check`.
  ("Target" the survey company pays money *in*; Target the store is money *out*.)
- **Personal:** groceries, restaurants without a business reason, streaming, family, home, clothes that aren't safety gear → `personal`, `high` when obvious.
- **Training:** courses that qualify Edgar for a new profession (e.g. PSM license exam prep) usually aren't deductible → `training`, `check`, note "license prep?".
- **Anything else unclear** → best guess, `check`.

## Example
Bank file:
```
Date,Description,Amount
10/02/2026,HOME DEPOT #123,-38.47
10/03/2026,ZELLE FROM M E LAND SURVEYING B-177608,450.00
10/04/2026,AMAZON MKTPLACE PMTS,-35.10
10/05/2026,PAYMENT THANK YOU-MOBILE,500.00
10/06/2026,SHELL OIL 57444,-52.10
10/07/2026,VERIZON WIRELESS,-85.00
```
What Atlas returns:
```
Date,Description,Amount,line,job,note,confidence
10/02/2026,HOME DEPOT #123,-38.47,field-supplies,,,high
10/03/2026,ZELLE FROM M E LAND SURVEYING B-177608,450.00,survey-pay,B-177608,,high
10/04/2026,AMAZON MKTPLACE PMTS,-35.10,tools,,can't see the item,check
10/05/2026,PAYMENT THANK YOU-MOBILE,500.00,transfer,,card payment,high
10/06/2026,SHELL OIL 57444,-52.10,vehicle,,,high
10/07/2026,VERIZON WIRELESS,-85.00,phone,,full bill: business share?,check
```

## What Ledger does with it
- `high` rows are filed. `check` rows wait in Books → **To review**, one line per merchant, with your category as the suggestion.
- When Edgar taps **File all** on a merchant, Ledger remembers it and files that merchant by itself in later statements, so reviews shrink every month.
- Importing a statement that is already in Ledger, now with the four columns, updates the rows still waiting for review. Rows Edgar already filed are not touched.
- Ledger also recognises the survey companies' deposits by itself (the company name, or the bank text Edgar typed in Setup → Companies), and files them as `survey-pay` without review. Atlas's `survey-pay` rows still win when both are present.
- The `job` column matters: a deposit or expense with a job number feeds **Reports → Profit per job** and **Survey companies** (earned vs paid). Fill it whenever the bank text shows a work-order number.
- Every statement import can be undone in **Files → Recent statement imports**, so a wrong file is not a disaster: undo it, fix it, import again.
- Rows dated in a year Edgar has closed (after filing) are skipped on import. Don't prepare statements for a closed year unless he reopens it.
