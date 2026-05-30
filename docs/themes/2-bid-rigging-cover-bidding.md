# 2. Bid rigging — cover bidding

## Description

Cover bidding occurs when competitors submit intentionally non-competitive bids to create a false appearance of
competition while ensuring a pre-arranged winner succeeds. Recurring losers consistently bid just above the winner, with
patterns suggesting coordination rather than genuine independent pricing.

- **Tools:** `search_sutartys`, `execute_query`
- **Goal:** Detect cover bidding — recurring losers always bidding just above winner.
- **Supervisory authorities:** STT, KT
- **OSINT sources:** industry associations, local media

## To Detect

> **Note**: **Bid suppression** (potential bidders deliberately abstaining from a tender) cannot be detected from
> available data. `atn1dalyviai` records only submitted bids, not invited parties. Do not claim bid suppression
> detection; defer to Theme 20 for partial insight via invitation data gaps. **Coverage warning**: `v_dalyviai` covers
> only ~20 buyer organisations that submitted ATN1 reports (~443 reports total). If a supplier's buyers are not among
> them, `v_dalyviai` will return 0 rows — this means **no data**, not no competition. Always verify coverage before
> drawing conclusions. **⚠ `eileNumeris` is 100% NULL** in current data — the win-rate query below (and any
> `eileNumeris = 1` filter) returns **0 wins for everyone**; winner-vs-loser structure is not recoverable. The reliable,
> rank-free competition screen is **single-bidding — see [theme 28](28-single-bidding-competition-intensity.md)**; start
> there before attempting cover-bid analysis.

- Win rate vs. participation count per supplier per CPV category (use as initial screening only — low win rate alone
  does not confirm cover bidding; legitimate SMEs may participate in many tenders without winning).
- Top co-bidder frequency (same losing bidders repeatedly present when a given winner participates).
- Losing bid clustering above winning price (small margins, consistent structure).
- Participation count vs. CPV national average (few bidders where market structure suggests more).
- Persistent patterns where one supplier often wins, others rarely win except where the main supplier does not bid.

## SQL Examples

```sql
-- Win rate vs. participation count per supplier — preliminary screening; very low win rate with high frequency warrants further co-bidder analysis
SELECT d.kodas                                                                AS "tiekejoKodas",
       j.pavadinimas                                                          AS tiekejas,
       COUNT(DISTINCT d."ataskaitaId")                                        AS dalyvutaPirkimuose,
       COUNT(DISTINCT CASE WHEN e."eileNumeris" = 1 THEN d."ataskaitaId" END) AS laimetaPirkimuose,
       ROUND(100.0 * COUNT(DISTINCT CASE WHEN e."eileNumeris" = 1 THEN d."ataskaitaId" END)
                 / COUNT(DISTINCT d."ataskaitaId"), 1)                        AS laimedamuProc
FROM "atn1dalyviai" d
         JOIN "jarCsv" j ON j."jarKodas"::text = d.kodas
LEFT JOIN "atn1pasiulymuEile" e
ON e."ataskaitaId" = d."ataskaitaId" AND e."dalyvioKodas" = d.kodas
WHERE d.kodas IS NOT NULL AND d.kodas <> ''
GROUP BY d.kodas, j.pavadinimas
HAVING COUNT(DISTINCT d."ataskaitaId") >= 10
ORDER BY laimedamuProc ASC, dalyvutaPirkimuose DESC
LIMIT 50;
```

```sql
-- Most frequent co-bidder pairs (same two companies appearing together repeatedly)
SELECT d1.kodas                         AS kodas1,
       j1.pavadinimas                   AS pavadinimas1,
       d2.kodas                         AS kodas2,
       j2.pavadinimas                   AS pavadinimas2,
       COUNT(DISTINCT d1."ataskaitaId") AS buvoPoroje
FROM "atn1dalyviai" d1
         JOIN "atn1dalyviai" d2 ON d2."ataskaitaId" = d1."ataskaitaId" AND d2.kodas > d1.kodas
         JOIN "jarCsv" j1 ON j1."jarKodas"::text = d1.kodas
JOIN "jarCsv" j2
ON j2."jarKodas":: text = d2.kodas
GROUP BY d1.kodas, j1.pavadinimas, d2.kodas, j2.pavadinimas
HAVING COUNT(DISTINCT d1."ataskaitaId") >= 15
ORDER BY buvoPoroje DESC
LIMIT 30;
```
