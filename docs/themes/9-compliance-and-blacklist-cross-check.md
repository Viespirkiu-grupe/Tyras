# 9. Compliance and blacklist cross-check

## Description

Compliance checks identify suppliers who have been formally debarred, sanctioned, or found in violation of legal
obligations, yet continue to receive public contracts — indicating either inadequate vetting or deliberate circumvention
of exclusion rules.

- **Tools:** `get_juridinis`, `execute_query`
- **Goal:** Check all blacklists, sanctions, and violations for company and linked parties.
- **Supervisory authorities:** STT, FNTT, VPT
- **OSINT sources:** sanction lists, media on fraud

## To Detect

- Current/expired debarment (melagingiTiekejai, nepatikimiTiekejai) and repeat non-compliance.
- VDI violations (vdiPazeidimai) during contract execution periods.
- Court cases where supplier is claimant against former or current buyers (`bylojeKaip = 'IEŠKOVAS'`).
- Linked-company blacklist status (group companies, same owners, same address/domain).

## SQL Examples

```sql
-- Contracts awarded to debarred suppliers (active during contract signing)
SELECT s."sutartiesUnikalusId",
       s."sudarymoData",
       s.verte,
       s."tiekejoKodas",
       j.pavadinimas                                                              AS tiekejas,
       s."perkanciosiosOrganizacijosKodas"                                        AS pirkejoKodas,
       buyer.pavadinimas                                                          AS pirkejas,
       CASE WHEN mt."tiekejoJarKodas" IS NOT NULL THEN '"melagingiTiekejai"' END  AS melagingasFlag,
       CASE WHEN nt."tiekejoJarKodas" IS NOT NULL THEN '"nepatikimiTiekejai"' END AS nepatikimasFlag
FROM sutartys s
         JOIN "jarCsv" j ON j."jarKodas"::text = s."tiekejoKodas"
JOIN "jarCsv" buyer
ON buyer."jarKodas":: text = s."perkanciosiosOrganizacijosKodas"
    LEFT JOIN "melagingiTiekejai" mt
    ON mt."tiekejoJarKodas" = s."tiekejoKodas"
    -- Check debarment was active at contract signing (start ≤ signing date ≤ end).
    -- Verify exact "start date" column name via get_schema ("itrauktasNuo" or similar).
    AND (mt."itrauktasIki" IS NULL OR mt."itrauktasIki" >= s."sudarymoData")
    LEFT JOIN "nepatikimiTiekejai" nt
    ON nt."tiekejoJarKodas" = s."tiekejoKodas"
    -- Same start-date caveat applies; verify column name in nepatikimiTiekejai via get_schema.
    AND (nt."itrauktaIki" IS NULL OR nt."itrauktaIki" >= s."sudarymoData")
WHERE (mt."tiekejoJarKodas" IS NOT NULL
   OR nt."tiekejoJarKodas" IS NOT NULL)
  AND s.istrinta = false
ORDER BY s."sudarymoData" DESC
LIMIT 50;
```
