# 26. Systemic internal control weaknesses in buyers

## Description

Systemic internal control weaknesses in buying organisations — such as high rates of non-competitive procedures,
repeated contract overruns, and unresolved audit findings — create structural conditions that enable and sustain
procurement fraud over time.

- **Tools:** `search_sutartys`, `execute_query`
- **Goal:** Identify buyers whose internal control weaknesses make them high-risk for corruption and fraud.
- **Supervisory authorities:** VK, STT, VPT
- **OSINT sources:** VK, VPT, internal audit reports

## To Detect

- High share of non-competitive procedures across all CPVs.
- Frequent corrections or cancellations of procurements.
- High rate of contracts with significant overruns or repeated amendments.
- Repeated audit findings about conflict-of-interest management, planning, or contract management weaknesses.

## SQL Examples

```sql
-- Buyers ranked by systemic weakness indicators: overruns + high non-competitive procedure share
SELECT s."perkanciosiosOrganizacijosKodas"                                  AS pirkejoKodas,
       jb.pavadinimas                                                       AS pirkejas,
       COUNT(*)                                                             AS sutarciuKiekis,
       COUNT(CASE WHEN s."faktineIvykdimoVerte" > s.verte * 1.3 THEN 1 END) AS virsijimukiekis,
       ROUND(100.0 * COUNT(CASE WHEN s."faktineIvykdimoVerte" > s.verte * 1.3 THEN 1 END) / COUNT(*),
             1)                                                             AS virsijimoProcent,
       COUNT(CASE WHEN vp.statusas IS NOT NULL AND vp."pirkimoBudas" NOT ILIKE '%atvir%' THEN 1
             END)                                                           AS nekonkurenciniai,
       ROUND(100.0 * COUNT(CASE WHEN vp.statusas IS NOT NULL AND vp."pirkimoBudas" NOT ILIKE '%atvir%' THEN 1 END) /
             COUNT(*),
             1)                                                             AS nekonkurProcent
FROM sutartys s
         JOIN "jarCsv" jb ON jb."jarKodas"::text = s."perkanciosiosOrganizacijosKodas"
LEFT JOIN "viesiejiPirkimai" vp
ON vp."pirkimoId" = s."pirkimoNumeris"
WHERE s.istrinta = false AND s."faktineIvykdimoVerte" IS NOT NULL AND s.verte > 0
GROUP BY s."perkanciosiosOrganizacijosKodas", jb.pavadinimas
HAVING COUNT(*) >= 10
ORDER BY virsijimoProcent DESC
LIMIT 30;
```

## Followup

For human investigator: VK and VPT audits highlight systemic weaknesses in internal control and risk management; use
their findings as context for MCP analytical outputs about the same institutions.
