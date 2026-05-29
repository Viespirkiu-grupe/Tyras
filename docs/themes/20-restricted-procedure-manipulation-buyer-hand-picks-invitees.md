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

- `atn1dalyviai` records submitted bids only, not invitees — cannot detect excluded qualified suppliers yet.
