# 20. Restricted procedure manipulation — buyer hand-picks the same invitees

## Description

Restricted procedure manipulation involves buyers repeatedly selecting the same small circle of companies for negotiated
or restricted tenders, effectively excluding competition while maintaining the appearance of a process with multiple
participants.

- **Tools:** `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `execute_query`
- **Goal:** Detect restricted/negotiated procedure overuse and audit findings for direct awards.
- **Supervisory authorities:** STT, KT, VPT
- **OSINT sources:** invitation letters, internal rules

## To Detect

- Procedure mix (restricted/negotiated vs. open) by buyer and CPV.
- `neskelbiamosDerybos` audit findings by buyer.
- Recurring small circle of invitees (if/when invitation data is available in future).
- **Single-bidding on the buyer's procurements** — restricted/hand-picked procedures collapse competition, which
  surfaces as single-bidder tenders. Confirm it per procurement via
  [theme 28](28-single-bidding-competition-intensity.md) (count `VI. DALYVIAI` in each ATN-1 report); this is the
  measurable corroboration of invitee manipulation when invitation lists themselves are not in the data.

## SQL Examples

```sql
-- Non-public negotiation audit findings ("neskelbiamosDerybos") grouped by buyer
SELECT nd."jarKodas"                                 AS pirkejoKodas,
       nd."jarPavadinimas"                           AS pirkejas,
       COUNT(*)                                      AS radininiuKiekis,
       STRING_AGG(nd.isvada, ' | ' ORDER BY nd.data) AS isvados,
       MIN(nd.data)                                  AS pirmasis,
       MAX(nd.data)                                  AS paskutinis
FROM "neskelbiamosDerybos" nd
GROUP BY nd."jarKodas", nd."jarPavadinimas"
ORDER BY radininiuKiekis DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- The ATN-1 report records **submitted bids only, not invitees** — excluded qualified suppliers cannot be detected;
  invitation lists are not in the data.
