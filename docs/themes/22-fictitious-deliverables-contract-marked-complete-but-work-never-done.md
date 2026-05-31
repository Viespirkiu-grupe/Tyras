# 22. Fictitious deliverables — contract marked complete but work never done

## Description

Fictitious deliverables involve contracts that are formally marked as completed and fully paid, while the actual goods,
services, or works were never delivered or were substantially deficient — a direct form of procurement fraud causing
financial loss to the public.

- **Tools:** `get_juridinis`, `get_sutartis`, `search_failai`, `get_failas_tekstas`, `execute_query` (SABIS invoices)
- **Goal:** Detect contracts where payment is confirmed but delivery is doubtful.
- **Supervisory authorities:** STT, FNTT, VK
- **OSINT sources:** on-site inspections, beneficiary reports, media

## To Detect

- `faktineIvykdimoVerte` paid in full despite weak or missing acceptance documentation.
- VDI violations (`vdiPazeidimai`) during execution suggesting lack of workforce capacity.
- **Advance invoices** (`sfTipas = 'Išankstinė sąskaita'`) on a contract — prepayment before delivery; high risk if the
  contract is short-lived or the supplier has no operational capacity (cross-check theme 1).
- **Invoices issued long after the contract expired** (`israsymoData` ≫ `galiojimoData`) — billing continues after
  delivery should have stopped, a signature of fabricated continuation or undocumented scope.
- **Fully invoiced by a supplier with zero workforce** (`v_company.darbuotojai = 0`) — paid but no capacity to deliver.
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

```sql
-- SABIS billing AFTER contract expiry: invoices issued >90 days past galiojimoData (delivery should have ended).
-- Bridge v_sutartys → sabisSutartys.vpId → sabisSaskaitos (see "SABIS payment-flow analysis" in the index).
-- A lead, not proof: legitimate late/retention billing exists. Pull the invoice list and cross-check capacity
-- (v_company.darbuotojai) and any acceptance documents (search_failai) before drawing a conclusion.
SELECT v."sutartiesUnikalusId",
       v.pavadinimas,
       v."tiekejoPavadinimas"                                AS tiekejas,
       v."galiojimoData",
       ROUND(v.verte)                                        AS sutartiesVerte,
       COUNT(*)                                              AS poPabaigosSaskaitu,
       ROUND(SUM(si."bendraSfSuma"))                         AS poPabaigosSuma,
       MAX(si."israsymoData")                                AS paskutineSaskaita,
       COUNT(CASE WHEN si."sfTipas" = 'Išankstinė sąskaita' THEN 1 END) AS isankstiniuSaskaitu
FROM v_sutartys v
         JOIN "sabisSutartys" sc ON sc."vpId" = v."sutartiesUnikalusId"::text
         JOIN "sabisSaskaitos" si ON si."sutartiesUid" = sc."sutartiesUid"
WHERE v."galiojimoData" IS NOT NULL
  AND si."bendraSfSuma" > 0
  AND si."sfTipas" IS DISTINCT FROM 'Kreditinė sąskaita'
  AND si."israsymoData" BETWEEN '2010-01-01' AND CURRENT_DATE
  AND si."israsymoData" > v."galiojimoData" + INTERVAL '90 days'
GROUP BY v."sutartiesUnikalusId", v.pavadinimas, v."tiekejoPavadinimas", v."galiojimoData", v.verte
HAVING SUM(si."bendraSfSuma") > 10000
ORDER BY poPabaigosSuma DESC
LIMIT 30;
```

## Followup

**Gap (data):**

- SABIS invoice-level data **is** available (`sabisSaskaitos`, ~14.4M invoices — see the index) and is used above to
  test billing-vs-delivery timing and advance payments. The remaining genuine gaps are: no acceptance-act /
  delivery-document status (only invoices, not goods-received notes), and no detailed STT/NKT audit trails in the
  schema.
