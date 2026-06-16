# 17. Price cartel — suspiciously uniform bid prices across a CPV category

## Description

A price cartel is indicated when independent competing bidders in the same tender submit prices that are suspiciously
uniform, suggesting prior coordination on bid levels rather than independently determined competitive offers.

- **Tools:** `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `get_failas_tekstas`, `execute_query` (structural
  screening)
- **Goal:** Detect tenders with abnormally low price variation among independent bidders — a primary cartel signal.
- **Supervisory authorities:** KT, STT
- **OSINT sources:** sector cost structures

## To Detect

> **Methodology note**: The correct unit of analysis is the **individual tender** — comparing the bids different
> suppliers submitted within the same procurement. Bid prices are now queryable in `v_dalyviai` for ~400 CVP IS
> procurements (Dec 2024 – Feb 2026, growing); use the SQL below to screen for low price variation at scale. For
> procurements not in `v_dalyviai`, bids are read from each procurement's ATN-1 report (`get_viesasis_pirkimas` →
> `get_failas_tekstas`, **p.7 `VII.3` pasiūlymų eilė** = ranked bids with prices; **p.6 `VII.2`** = rejected bids with
> prices). So CV is computed **per tender, by hand, from the file** when v_dalyviai lacks coverage. Only **new CVP IS**
> procurements (≈2022→today) carry these files. Use SQL only to **shortlist** which tenders to open; never compute a
> cross-tender national CV as a finding — it conflates buyers, specs, years, and scales and says nothing about cartel
> behaviour.

- Coefficient of variation of bid prices **within an individual tender** (CV < 5% with ≥ 3 bidders is a strong signal) —
  computed from that tender's `VII.3` bid list.
- The same suppliers recurring across tenders that show suspiciously uniform prices.
- Clustering of such low-variation tenders in certain buyers or regions.

## Method — shortlist with SQL, compute CV from the ATN-1 file

```sql
-- Stage 0: tenders with suspiciously low price variation (v_dalyviai, CVP IS only, ~400 procurements).
-- CV < 5 % with ≥ 3 bidders is a strong cartel signal; verify by reading the full ATN-1 file for hits.
WITH prices AS (SELECT "pirkimoNumeris",
                       "pirkejoKodas",
                       COUNT(DISTINCT "tiekejoKodas") AS dalyviu,
                       AVG("pasiulymoKaina")          AS vidKaina,
                       STDDEV("pasiulymoKaina")       AS stdKaina
                FROM v_dalyviai
                WHERE "pasiulymoKaina" IS NOT NULL
                  AND "eileNumeris" IS NOT NULL
                  AND "daliesNumeris" IS NULL
                GROUP BY "pirkimoNumeris", "pirkejoKodas"
                HAVING COUNT(DISTINCT "tiekejoKodas") >= 3)
SELECT "pirkimoNumeris",
       "pirkejoKodas",
       dalyviu,
       ROUND(vidKaina)                                             AS vidKaina,
       ROUND(stdKaina)                                            AS stdKaina,
       ROUND(100.0 * stdKaina / NULLIF(vidKaina, 0), 2)           AS cv_proc
FROM prices
WHERE stdKaina / NULLIF(vidKaina, 0) < 0.05
ORDER BY cv_proc ASC
LIMIT 30;
```

```sql
-- Stage 1: CPV groups + buyers with several competing suppliers (where ≥3-bidder tenders to inspect exist).
-- This finds WHERE to look; it does not measure bid uniformity (bids are not in any table).
SELECT LEFT(s."bvpzKodas", 3)               AS cpvGrupe,
       s."pirkejoKodas",
       MAX(s.pirkejas)                      AS pirkejas,
       COUNT(DISTINCT s."tiekejoKodas")     AS skirtinguTiekeju,
       COUNT(*)                             AS sutarciuKiekis
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE AND s."bvpzKodas" IS NOT NULL
GROUP BY LEFT(s."bvpzKodas", 3), s."pirkejoKodas"
HAVING COUNT(DISTINCT s."tiekejoKodas") >= 3
ORDER BY sutarciuKiekis DESC
LIMIT 40;
```

**Stage 2 (per shortlisted procurement):** `get_viesasis_pirkimas(pirkimoId)` → open the ATN-1 file →
`get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)`. From **p.7 (`VII.3`)** list every bidder's price; if there are ≥3
independent bidders and the spread is tiny (CV < ~5%, prices clustered within a fraction of a percent, or suspiciously
round/sequential), record it as a cartel signal. Note repeat suppliers across such tenders. Report the procurement ID,
bidder codes, and the exact prices — these are the evidence for a KT referral.
