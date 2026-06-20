# 14. Spec rigging — technical specifications written for one supplier

## Description

Specification rigging involves drafting tender technical requirements so narrowly — or using brand-specific language —
that only one predetermined supplier can qualify, eliminating genuine competition under the guise of legitimate
technical requirements.

- **Tools:** `search_failai`, `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `get_failas_tekstas`, `execute_query`
- **Goal:** Detect buyers with abnormally high single-bidder rate in a CPV category and specification patterns favouring
  one supplier.
- **Supervisory authorities:** STT, KT, VPT
- **OSINT sources:** technical standards, competing products, prior tenders

## To Detect

- Single-bidder procurements concentrated in one buyer/CPV (the outcome spec-rigging produces) — confirmed via
  [theme 28](28-single-bidding-competition-intensity.md)'s per-procurement bidder count.
- Repeat winner in those single-bidder tenders.
- Technical specification language that matches one brand/model; repeated exclusionary requirements (e.g. specific
  patents, small deviations) — read from the tender documents via `search_failai` / `get_failas_tekstas`.
- Use of overly narrow CPV codes or contract splitting to keep competition away.

## Method — screen structurally, confirm the single bidder, then read the spec

Bidder counts are not queryable; they are read per procurement from the ATN-1 report (see
[theme 28](28-single-bidding-competition-intensity.md) and the **Participant & bid data** section of the MCP index).

1. **Shortlist (SQL).** Find buyer + CPV pairs where one supplier wins repeatedly — the pattern spec-rigging leaves
   behind:

```sql
-- Buyer + CPV where a single supplier captures most contracts (spec-rigging candidate clusters).
SELECT s."pirkejoKodas",
       MAX(s.pirkejas)                  AS pirkejas,
       LEFT(s."bvpzKodas", 3)           AS cpvGrupe,
       s."tiekejoKodas",
       MAX(s.tiekejas)                  AS tiekejas,
       COUNT(*)                         AS laimejimuKiekis
FROM v_sutartys s
WHERE s.istrinta IS NOT TRUE AND s."bvpzKodas" IS NOT NULL
GROUP BY s."pirkejoKodas", LEFT(s."bvpzKodas", 3), s."tiekejoKodas"
HAVING COUNT(*) >= 5
ORDER BY laimejimuKiekis DESC
LIMIT 30;
```

2. **Confirm single-bidding.** First check `v_dalyviai`:
   `SELECT COUNT(DISTINCT "tiekejoKodas") FROM v_dalyviai WHERE "pirkimoNumeris" = '...'` — one bidder confirms
   single-bidding without file reading. If the procurement is not in `v_dalyviai`, use `get_viesasis_pirkimas` →
   `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` and count the `VI. DALYVIAI` rows.
3. **Read the specification.** Pull the tender's technical-requirements document (`search_failai` /
   `get_failas_tekstas`) and look for brand/model-specific or otherwise exclusionary language that fits only the winner.
