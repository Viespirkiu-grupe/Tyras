# 28. Single-bidding — the headline competition-intensity indicator

## Description

Single-bidding — a procurement that attracts exactly **one** bidder — is the single most validated corruption-risk
indicator in EU public-procurement research (Fazekas / DIGIWHIST Corruption Risk Index, Opentender). A high
single-bidder rate signals competition that is absent, suppressed, or steered: specifications written for one supplier
(theme 14), restricted invitee circles (theme 20), cover-bidding that collapsed (theme 2), or a structural monopoly
(theme 23). It is a **screening indicator**, not proof — a single bid can be legitimate (genuinely thin market). Its
value is comparative: buyers, suppliers, and CPV sectors that repeatedly run uncontested procedures warrant a closer
look.

This theme makes single-bidding a first-class indicator rather than a side-effect of themes 2/20.

- **Tools:** `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `get_failas_tekstas`, `execute_query` (structural
  screening)
- **Goal:** Identify buyers/suppliers/sectors that systematically run uncontested procedures, and confirm single-bidding
  on individual procurements by reading their bidder list.
- **Supervisory authorities:** STT, KT, VPT
- **OSINT sources:** sector market structure (how many capable suppliers plausibly exist), media on contested tenders

## How bidder counts are obtained — read first

There is **no queryable table or view of bidders or bid counts**.

> **Update:** `v_dalyviai` now provides aggregate bidder counts in SQL for ~400 CVP IS procurements (Dec 2024 – Feb
> 2026). Run the v_dalyviai query in the SQL Examples section first. For procurements not in `v_dalyviai`, use the ATN-1
> file route below.

The number of bidders on a procurement is read **one procurement at a time** from its official **ATN-1 "Pirkimo
procedūrų ataskaita"** XLSX (see the **Participant & bid data** section of the MCP index):

1. `get_viesasis_pirkimas(pirkimoId)` → find the ATN-1 file (filename starts `PPA-`, `ATN-`, or `Atn-1`, `xlsx`).
2. `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` → **p.4 `VI. DALYVIAI (KANDIDATAI)`** lists every bidder with
   its JAR code. **Count the bidder rows.** One bidder = single-bidding. (p.7 `VII.3` gives the ranked bid list with
   prices if you also need the winner/margins.)

Two consequences for scope:

- **Only new CVP IS procurements (≈2022→today) have these files.** Old CVPP procurements (2017→2024) carry **no** bidder
  data — single-bidding cannot be determined for them. State this rather than implying competition was present.
- **There is no market-wide single-bidder rate to query.** Do not report an aggregate percentage. Instead screen
  structurally (below) to find where uncompetitive procedures cluster, then open the ATN-1 files of the specific
  procurements to confirm the bidder count.

## To Detect

A two-stage method — screen at scale, then confirm per procurement:

**Stage 1 — structural screen (SQL, whole market).** Find buyers / suppliers / sectors whose procedure and award
patterns predict low competition, and shortlist candidate procurements:

- **Non-competitive procedure mix per buyer** — share of direct-award / negotiated / single-source procedures in
  `v_pirkimas.pirkimoBudas` (overlaps themes 7, 20). High share = competition routinely bypassed.
- **De-facto single-source procedures** — `neskelbiamosDerybos` audit findings (theme 20) name buyers who ran
  unadvertised negotiations; these are uncontested by construction.
- **Repeat buyer→supplier concentration** — one supplier taking a dominant share of a buyer's contracts in a CPV in
  `v_sutartys` (themes 6, 19, 23) is the _outcome_ a high single-bidder rate produces.

**Stage 2 — confirm on the procurement (ATN-1 file).** For each shortlisted new-CVP-IS procurement, open its ATN-1
report and count the `VI. DALYVIAI` rows:

- **One bidder** → confirmed single-bidding; a binary red flag for that procurement (feeds the composite risk score).
- A supplier that is repeatedly the **only** bidder for the same buyer is a favoritism / spec-rigging lead (cross-check
  themes 14, 19, 23).

> **Threshold guidance:** single-bidding is a screen, not proof. Weight it by how contestable the market plausibly is
> (sector, value, lot design): a sole bid for a niche specialist service is weaker than a sole bid for a commodity many
> firms supply. A pattern across several of a buyer's procurements is far stronger than a single instance. EU research
> treats systematically high single-bidder rates (well above a peer/sector norm) as the headline risk flag.

## SQL Examples (Stage-1 structural screen)

These run against still-queryable views; they do **not** measure bidder counts (which require the ATN-1 files) — they
surface where to look.

```sql
-- Single-bidder rate per buyer from parsed ATN-1 data (v_dalyviai, CVP IS only, ~400 procurements).
-- Use this first; fall back to ATN-1 file reading for procurements not in v_dalyviai.
WITH per_pirkimas AS (SELECT "pirkimoNumeris",
                             "pirkejoKodas",
                             COUNT(DISTINCT "tiekejoKodas") AS dalyviu
                      FROM v_dalyviai
                      GROUP BY "pirkimoNumeris", "pirkejoKodas")
SELECT "pirkejoKodas",
       COUNT(*)                                                          AS pirkimuKiekis,
       COUNT(*) FILTER (WHERE dalyviu = 1)                              AS vienoDalyvioPirkimai,
       ROUND(100.0 * COUNT(*) FILTER (WHERE dalyviu = 1) / COUNT(*), 1) AS vienoDalyvioProcent,
       ROUND(AVG(dalyviu), 1)                                           AS vidutinasDalyviu
FROM per_pirkimas
GROUP BY "pirkejoKodas"
HAVING COUNT(*) >= 3
ORDER BY vienoDalyvioProcent DESC
LIMIT 30;
```

```sql
-- Procedure mix per buyer: share of non-open / negotiated procedures (competition-bypass screen).
-- High "uždaroProc" buyers are the ones whose individual procurements are worth opening for a bidder count.
SELECT "jarKodas"                         AS pirkejoKodas,
       MAX(organizatorius)                AS pirkejas,
       COUNT(*)                           AS pirkimuKiekis,
       COUNT(*) FILTER (WHERE "pirkimoBudas" NOT ILIKE '%atviras%')        AS neAtviri,
       ROUND(100.0 * COUNT(*) FILTER (WHERE "pirkimoBudas" NOT ILIKE '%atviras%')
                 / COUNT(*), 1)           AS neAtviruProc
FROM v_pirkimas
WHERE "jarKodas" IS NOT NULL
  AND "pirkimoBudas" IS NOT NULL
GROUP BY "jarKodas"
HAVING COUNT(*) >= 10
ORDER BY neAtviruProc DESC, pirkimuKiekis DESC
LIMIT 30;
```

```sql
-- Buyer→supplier concentration in a CPV division: a dominant supplier is what a high single-bidder rate predicts.
-- Parameterise the CPV prefix; HAVING keeps pairs with a meaningful share.
SELECT s."pirkejoKodas",
       MAX(s.pirkejas)                                   AS pirkejas,
       s."tiekejoKodas",
       MAX(s.tiekejas)                                   AS tiekejas,
       COUNT(*)                                          AS sutarciuKiekis,
       ROUND(SUM(s.verte))                               AS bendraVerte
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE
  AND LEFT(s."bvpzKodas", 2) = '72'        -- e.g. IT services; change per sector
GROUP BY s."pirkejoKodas", s."tiekejoKodas"
HAVING COUNT(*) >= 5
ORDER BY sutarciuKiekis DESC, bendraVerte DESC
LIMIT 30;
```

Then, for the procurements behind the top rows, run `get_viesasis_pirkimas` → `get_failas_tekstas` and count the
`VI. DALYVIAI` bidders to confirm whether the wins were uncontested.

## Followup

**Gap (data):**

- **Bidder counts are now partially queryable via `v_dalyviai`** for ~400 CVP IS procurements (Dec 2024 – Feb 2026,
  growing). For the rest, they can be read only from new-CVP-IS ATN-1 reports, one procurement at a time; old CVPP
  procurements have none. Single-bidding cannot yet be computed as a full market-wide rate — `v_dalyviai` coverage will
  grow as more ATN-1 reports are ingested.
- **Report what was checked.** In a referral, state which specific procurements were opened, how many bidders each had,
  and that single-bidding could not be assessed for procurements without an ATN-1 report.
