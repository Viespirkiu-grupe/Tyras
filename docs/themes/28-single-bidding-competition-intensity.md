# 28. Single-bidding — the headline competition-intensity indicator

## Description

Single-bidding — a procurement that attracts exactly **one** bidder — is the single most validated corruption-risk
indicator in EU public-procurement research (Fazekas / DIGIWHIST Corruption Risk Index, Opentender). A high
single-bidder rate signals competition that is absent, suppressed, or steered: specifications written for one supplier
(theme 14), restricted invitee circles (theme 20), cover-bidding that collapsed (theme 2), or a structural monopoly
(theme 23). It is a **screening indicator**, not proof — a single bid can be legitimate (genuinely thin market). Its
value is comparative: buyers, suppliers, and CPV sectors whose single-bidder rate is materially above the baseline
warrant a closer look.

This theme makes single-bidding a first-class, computed indicator rather than a side-effect of themes 2/20. It is the
seed of the planned Tyras indicator framework (see `TODO-domain.md` P1.1).

- **Tools:** `execute_query` (the bidder count is only computable in SQL)
- **Goal:** Compute the single-bidder rate per buyer, per supplier, and per CPV from `v_dalyviai`, rank entities against
  the covered-set baseline, and — where `v_dalyviai` has no coverage — state that competition intensity is
  **unmeasured** and pivot to the structural proxies below.
- **Supervisory authorities:** STT, KT, VPT
- **OSINT sources:** sector market structure (how many capable suppliers plausibly exist), media on contested tenders

## Coverage — read before running anything

`v_dalyviai` (ATN1 bidder data) covers **only ~400 procurements from ~38 buyers**, and one buyer (JAR `135163499`, Kauno
klinikos) is ~62% of it. In the covered set the single-bidder rate is **25.7%** (102 / 397 procurements; verified). Two
hard consequences:

- **For ~all other buyers/suppliers, bidder counts do not exist.** An empty result is **no data, not full competition.**
  Never report "no single-bidding concerns" for an entity with zero ATN1 coverage — say the indicator is uncomputable
  and use the proxies in the last section.
- **`v_dalyviai.eileNumeris` is 100% NULL** (verified, raw and view) — the bid _rank_ / winner is **not recoverable**
  from this data. Single-bidding sidesteps this: in a one-bidder procurement the sole bidder is the winner by
  definition, so no rank column is needed. (Any theme query that filters `eileNumeris = 1` returns nothing — see theme 2
  caveat.)

Always confirm coverage first:
`SELECT COUNT(*) FROM atn1ataskaitos WHERE "perkanciosiosOrganizacijosKodas" = '<kodas>'`. If 0, this theme is
inoperative for that entity.

## To Detect

- **Single-bidder rate per buyer** vs. the covered-set baseline (25.7%) — buyers materially above it with enough volume
  are systematically running uncompetitive procedures.
- **Single-bidder rate per CPV division** — sectors where competition is structurally or artificially thin (IT services
  `72`, medical `33` ran high in the covered set).
- **Uncontested-participation rate per supplier** — suppliers who repeatedly bid **and** were the only bidder. A
  supplier that keeps winning uncontested for the same buyer is a favoritism / spec-rigging lead (cross-check themes 14,
  19, 23).
- **The single-bidder flag on a specific procurement** — a binary red flag feeding the composite risk score (P1.2).

> **Threshold guidance:** treat the covered-set rate (≈26%) as the internal baseline. Flag a buyer/CPV/supplier only
> with a meaningful denominator (≥5 procurements) **and** a rate well above baseline (≥50% is a strong screen). A single
> uncontested procurement is a data point, not a pattern.

## SQL Examples

```sql
-- Single-bidder rate per BUYER (covered set). Bidders counted per procurement, then aggregated by buyer.
-- Baseline for comparison: ~25.7% across all covered procurements.
SELECT p."pirkejoKodas",
       MAX(j.pavadinimas)                                        AS pirkejas,
       COUNT(*)                                                  AS pirkimuKiekis,
       COUNT(*) FILTER (WHERE p.bidders = 1)                     AS vienoDalyvio,
       ROUND(100.0 * COUNT(*) FILTER (WHERE p.bidders = 1) / COUNT(*), 1) AS vienoDalyvioProc
FROM (SELECT "pirkimoNumeris",
             "pirkejoKodas",
             COUNT(DISTINCT "tiekejoKodas") AS bidders
      FROM v_dalyviai
      WHERE "tiekejoKodas" IS NOT NULL AND "tiekejoKodas" <> ''
      GROUP BY "pirkimoNumeris", "pirkejoKodas") p
         LEFT JOIN "jarCsv" j ON j."jarKodas"::text = p."pirkejoKodas"
GROUP BY p."pirkejoKodas"
HAVING COUNT(*) >= 5
ORDER BY vienoDalyvioProc DESC, pirkimuKiekis DESC
LIMIT 30;
```

```sql
-- Single-bidder rate per CPV division (first 2 digits of bvpz). Surfaces sectors with thin competition.
SELECT LEFT(p."pagrindinisKodasBvpz", 2)                         AS cpvSkyrius,
       COUNT(*)                                                  AS pirkimuKiekis,
       COUNT(*) FILTER (WHERE p.bidders = 1)                     AS vienoDalyvio,
       ROUND(100.0 * COUNT(*) FILTER (WHERE p.bidders = 1) / COUNT(*), 1) AS vienoDalyvioProc
FROM (SELECT "pirkimoNumeris",
             MAX("pagrindinisKodasBvpz")    AS "pagrindinisKodasBvpz",
             COUNT(DISTINCT "tiekejoKodas") AS bidders
      FROM v_dalyviai
      WHERE "tiekejoKodas" IS NOT NULL AND "tiekejoKodas" <> ''
      GROUP BY "pirkimoNumeris") p
WHERE p."pagrindinisKodasBvpz" IS NOT NULL
GROUP BY LEFT(p."pagrindinisKodasBvpz", 2)
HAVING COUNT(*) >= 5
ORDER BY vienoDalyvioProc DESC
LIMIT 30;
```

```sql
-- Uncontested-participation rate per SUPPLIER: of the procurements a supplier bid in, how many had only it.
-- (Sole bidder = winner, so this is also the supplier's uncontested-win rate; no eileNumeris needed.)
SELECT d."tiekejoKodas",
       MAX(d.tiekejas)                                                             AS tiekejas,
       COUNT(DISTINCT d."pirkimoNumeris")                                          AS dalyvavoPirkimuose,
       COUNT(DISTINCT d."pirkimoNumeris") FILTER (WHERE b.bidders = 1)             AS vienintelisDalyvis,
       ROUND(100.0 * COUNT(DISTINCT d."pirkimoNumeris") FILTER (WHERE b.bidders = 1)
                 / COUNT(DISTINCT d."pirkimoNumeris"), 1)                          AS neturejoKonkurencijosProc
FROM v_dalyviai d
         JOIN (SELECT "pirkimoNumeris",
                      COUNT(DISTINCT "tiekejoKodas") AS bidders
               FROM v_dalyviai
               WHERE "tiekejoKodas" IS NOT NULL AND "tiekejoKodas" <> ''
               GROUP BY "pirkimoNumeris") b ON b."pirkimoNumeris" = d."pirkimoNumeris"
WHERE d."tiekejoKodas" IS NOT NULL AND d."tiekejoKodas" <> ''
GROUP BY d."tiekejoKodas"
HAVING COUNT(DISTINCT d."pirkimoNumeris") >= 4
ORDER BY neturejoKonkurencijosProc DESC, dalyvavoPirkimuose DESC
LIMIT 30;
```

```sql
-- The single-bidder flag for one buyer's individual procurements (drill-down / risk-score feed).
-- Parameterise :kodas with the buyer JAR code under investigation.
SELECT "pirkimoNumeris",
       MAX("pirkimoObjektoPavadinimas")  AS objektas,
       MAX("pagrindinisKodasBvpz")       AS bvpz,
       COUNT(DISTINCT "tiekejoKodas")     AS dalyviuSkaicius,
       (COUNT(DISTINCT "tiekejoKodas") = 1) AS vienoDalyvioVeliava
FROM v_dalyviai
WHERE "pirkejoKodas" = :kodas
  AND "tiekejoKodas" IS NOT NULL AND "tiekejoKodas" <> ''
GROUP BY "pirkimoNumeris"
ORDER BY dalyviuSkaicius ASC, "pirkimoNumeris";
```

## Where `v_dalyviai` has no coverage — structural proxies (lower confidence)

There is **no bid-count field anywhere outside `v_dalyviai`** — `sutartysAtviriDuomenys`, `cvppViesiejiPirkimai`, and
`v_pirkimas` record awards and notices, **not the number of tenders received**. So true single-bidding cannot be
measured for uncovered buyers. The honest fallback is to flag _structural_ lack of competition, clearly labelled as a
different (weaker) signal:

- **De-facto single-source procedures** — `neskelbiamosDerybos` audit findings (theme 20) name buyers who ran
  unadvertised negotiations; these are uncontested by construction.
- **Single-supplier dominance** — repeat buyer→supplier concentration in `v_sutartys` (themes 6, 19, 23): one supplier
  taking a dominant share of a buyer's contracts in a CPV is the _outcome_ a high single-bidder rate would predict.
- **Procedure mix** — share of non-open procedures in `v_pirkimas.pirkimoBudas` by buyer (theme 7/20). Note this view
  lists **published** procedures only and includes non-award rows (`Rinkos konsultacija`), so it is a coarse proxy, not
  a count.

State explicitly in any referral that these proxies measure procedural/market structure, **not** observed bidder counts,
and that observed single-bidding could not be computed for the entity due to ATN1 coverage limits (theme caveat above).

## Followup

**Gap (data):**

- **Bidder counts exist only for ~38 buyers** — the single strongest corruption proxy is, in practice, computable only
  for a sliver of the market. Broader ATN1 ingestion (or a notice-level "tenders received" field) would make this
  indicator system-wide; flagged for the MCP team in `TODO-domain.md`.
- **`eileNumeris` is unpopulated** — bid rank / winner-vs-loser structure is unavailable, so this theme is limited to
  the count dimension (single vs. multi) and cannot extend to winning-margin or cover-bid-spread analysis (theme 2/17)
  on the same data.
