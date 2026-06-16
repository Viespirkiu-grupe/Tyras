# 2. Bid rigging — cover bidding

## Description

Cover bidding occurs when competitors submit intentionally non-competitive bids to create a false appearance of
competition while ensuring a pre-arranged winner succeeds. Recurring losers consistently bid just above the winner, with
patterns suggesting coordination rather than genuine independent pricing.

- **Tools:** `search_sutartys`, `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `get_failas_tekstas`,
  `execute_query`
- **Goal:** Detect cover bidding — recurring losers always bidding just above winner.
- **Supervisory authorities:** STT, KT
- **OSINT sources:** industry associations, local media

## To Detect

> **Bid prices are queryable in `v_dalyviai` for ~400 CVP IS procurements (Dec 2024 – Feb 2026, growing).** Run the SQL
> below to screen co-bidder pairs and bid spreads in bulk, then open specific procurements' ATN-1 reports for detail.
> For procurements not in `v_dalyviai`, bid prices live only in each procurement's ATN-1 report, read via
> `get_viesasis_pirkimas` → `get_failas_tekstas` (see **Participant & bid data** in the MCP index). **p.7 (`VII.3`
> pasiūlymų eilė)** gives the ranked bid list with **rank, bidder code, and price**; **p.6 (`VII.2`)** gives
> rejected/withdrawn bids. Outside `v_dalyviai`'s ~400-procurement window, co-bidding patterns are assembled by reading
> several procurements' files. Only **new CVP IS** procurements (≈2022→today) have these files; **old CVPP**
> procurements have no bid data (do not read absence as competition). **Bid suppression** (invited parties abstaining)
> still cannot be detected — the report records submitted bids, not invitees; defer to theme 20. Before cover-bid
> analysis, screen with **single-bidding — see [theme 28](28-single-bidding-competition-intensity.md)**: a tender that
> collapsed to one bidder is the limiting case of suppressed competition.

- Losing bid clustering just above the winning price (small, consistent margins) — read from `VII.3` on the ATN-1 file.
- Top co-bidder frequency (same losing bidders repeatedly present when a given winner wins) — assembled across several
  procurements' bidder lists (`VI. DALYVIAI`).
- Win rate vs. participation per supplier (low win rate with high frequency = possible designated loser) — screen
  candidates structurally (below), then confirm wins/losses from the ranked bid lists.
- Few bidders where market structure suggests more — single-bidding (theme 28) as the extreme case.
- Persistent patterns where one supplier wins and others rarely win except when that supplier does not bid.

## Method — screen with SQL, confirm in the ATN-1 files

There is no bid-level table to query for the full market. For the ~400 CVP IS procurements in `v_dalyviai`, co-bidder
pairs and bid margins can be screened in SQL first. Use `v_sutartys` to find repeat buyer→supplier/co-supplier clusters
worth inspecting, then open the candidate procurements' ATN-1 reports to examine the actual bids.

```sql
-- Stage 1a: co-bidder pairs recurring across procurements (v_dalyviai, CVP IS only).
-- Recurring presence of the same pair — one always winning, the other always losing — is the cover-bid signature.
SELECT d1."tiekejoKodas"                   AS kodas1,
       MAX(d1.tiekejas)                     AS tiekejas1,
       d2."tiekejoKodas"                   AS kodas2,
       MAX(d2.tiekejas)                     AS tiekejas2,
       COUNT(DISTINCT d1."pirkimoNumeris") AS bendriPirkimai
FROM v_dalyviai d1
         JOIN v_dalyviai d2
              ON d2."pirkimoNumeris" = d1."pirkimoNumeris"
                  AND d2."tiekejoKodas" > d1."tiekejoKodas"
GROUP BY d1."tiekejoKodas", d2."tiekejoKodas"
HAVING COUNT(DISTINCT d1."pirkimoNumeris") >= 2
ORDER BY bendriPirkimai DESC
LIMIT 30;
```

```sql
-- Stage 1b: bid spread from v_dalyviai — tenders where rank-2 bid is within 5 % of rank-1 (cover-bid margin).
-- Single-part lots only (daliesNumeris IS NULL); requires at least 2 ranked bids with known prices.
SELECT d."pirkimoNumeris",
       COUNT(DISTINCT d."tiekejoKodas")                                                        AS dalyviu,
       r.laimejasKaina,
       r.antrasKaina,
       ROUND((r.antrasKaina - r.laimejasKaina) / NULLIF(r.laimejasKaina, 0) * 100, 2)         AS skirtumoProcent
FROM v_dalyviai d
         JOIN (SELECT "pirkimoNumeris",
                      MIN("pasiulymoKaina") FILTER (WHERE "eileNumeris" = 1) AS laimejasKaina,
                      MIN("pasiulymoKaina") FILTER (WHERE "eileNumeris" = 2) AS antrasKaina
               FROM v_dalyviai
               WHERE "eileNumeris" IS NOT NULL
                 AND "pasiulymoKaina" IS NOT NULL
                 AND "daliesNumeris" IS NULL
               GROUP BY "pirkimoNumeris") r ON r."pirkimoNumeris" = d."pirkimoNumeris"
WHERE r.laimejasKaina IS NOT NULL AND r.antrasKaina IS NOT NULL
GROUP BY d."pirkimoNumeris", r.laimejasKaina, r.antrasKaina
HAVING COUNT(DISTINCT d."tiekejoKodas") >= 2
   AND (r.antrasKaina - r.laimejasKaina) / NULLIF(r.laimejasKaina, 0) BETWEEN 0 AND 0.05
ORDER BY skirtumoProcent ASC
LIMIT 30;
```

```sql
-- Stage 1c: repeat winner concentration per buyer + CPV — shortlist tenders to open.
-- A supplier winning the same buyer's CPV repeatedly is where designated-winner / cover-bid patterns hide.
SELECT s."pirkejoKodas",
       MAX(s.pirkejas)            AS pirkejas,
       LEFT(s."bvpzKodas", 3)     AS cpvGrupe,
       s."tiekejoKodas",
       MAX(s.tiekejas)            AS tiekejas,
       COUNT(*)                   AS laimejimuKiekis,
       ROUND(SUM(s.verte))        AS bendraVerte
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE AND s."bvpzKodas" IS NOT NULL
GROUP BY s."pirkejoKodas", LEFT(s."bvpzKodas", 3), s."tiekejoKodas"
HAVING COUNT(*) >= 5
ORDER BY laimejimuKiekis DESC, bendraVerte DESC
LIMIT 40;
```

**Stage 2 (per shortlisted procurement):** `get_viesasis_pirkimas(pirkimoId)` → open the ATN-1 file →
`get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)`. On **p.7 (`VII.3`)** read each bidder's price and rank; flag
losing bids that sit just fractionally above the winner, the same firms recurring as designated losers across the
buyer's tenders, and round-number or implausibly uniform spreads. Record the procurement IDs, bidder codes, and prices
verbatim — these are the evidence for a KT/STT referral.
