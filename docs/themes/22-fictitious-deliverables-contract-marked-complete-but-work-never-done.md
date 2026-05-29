# 22. Fictitious deliverables — contract marked complete but work never done

## Description

Fictitious deliverables involve contracts that are formally marked as completed and fully paid, while the actual goods,
services, or works were never delivered or were substantially deficient — a direct form of procurement fraud causing
financial loss to the public.

- **Tools:** `get_juridinis`, `get_sutartis`, `search_failai`, `get_failas_tekstas`
- **Goal:** Detect contracts where payment is confirmed but delivery is doubtful.
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** on-site inspections, beneficiary reports, media

## To Detect

- `faktineIvykdimoVerte` paid in full despite weak or missing acceptance documentation.
- VDI violations (`vdiPazeidimai`) during execution suggesting lack of workforce capacity.
- For works contracts, repeated complaints or negative findings in oversight reports (OSINT).

## SQL Examples

```sql
-- Fully paid contracts to suppliers with VDI labour violations during the contract execution period
SELECT s."sutartiesUnikalusId",
       s.pavadinimas,
       s."sudarymoData",
       s."galiojimoData",
       s."tiekejoKodas",
       j.pavadinimas          AS tiekejas,
       s.verte,
       s."faktineIvykdimoVerte",
       COUNT(DISTINCT vdi.id) AS vdiPazeidimuKiekis
FROM sutartys s
         JOIN "jarCsv" j ON j."jarKodas"::text = s."tiekejoKodas"
JOIN "vdiPazeidimai" vdi
ON vdi."jarKodas" = s."tiekejoKodas"
-- Only violations that occurred during contract execution; verify date column name via get_schema.
-- AND vdi."pažeidimoDatas" BETWEEN s."sudarymoData" AND COALESCE(s."galiojimoData", s."sudarymoData" + INTERVAL '2 years')
WHERE s."faktineIvykdimoVerte" IS NOT NULL
  AND s."faktineIvykdimoVerte" >= s.verte * 0.95
  AND s.istrinta = false
GROUP BY s."sutartiesUnikalusId", s.pavadinimas, s."sudarymoData", s."galiojimoData",
    s."tiekejoKodas", j.pavadinimas, s.verte, s."faktineIvykdimoVerte"
HAVING COUNT(DISTINCT vdi.id) > 0
ORDER BY s.verte DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- No SABIS invoice-level data or detailed STT/NKT audit trails in schema.
