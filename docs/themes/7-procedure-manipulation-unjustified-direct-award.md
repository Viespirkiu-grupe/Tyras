# 7. Procedure manipulation — unjustified direct award

## Description

Procedure manipulation occurs when buyers misuse or misclassify procurement exceptions — such as urgency or
single-source justifications — to bypass open competition and award contracts directly to preferred suppliers without
adequate justification.

- **Tools:** `search_viesieji_pirkimai`, `get_viesasis_pirkimas`, `execute_query`
- **Goal:** Detect overuse of negotiated-without-publication or restricted procedures, and possible misclassification of
  urgency/exception conditions.
- **Supervisory authorities:** STT, VPT, VK
- **OSINT sources:** audit reports, media

## To Detect

- Direct-negotiation value share vs. open competition by buyer and CPV over time.
- Trend over time, including spikes in specific years or budget periods.
- Top beneficiary suppliers, especially newly created entities or those with conflicts of interest.
- Justification text in procurement notices and documents indicating vague or repetitive reasons.

## SQL Examples

```sql
-- Procedure mix by buyer: count and value share of each "pirkimoBudas" type
SELECT vp."jarKodas"                                                                AS pirkejoKodas,
       j.pavadinimas                                                                AS pirkejas,
       vp."pirkimoBudas",
       COUNT(*)                                                                     AS pirkimuKiekis,
       ROUND(SUM(vp."numatomaVerteEUR"))                                            AS totalVerteEUR,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY vp."jarKodas"), 1) AS procentas
FROM "viesiejiPirkimai" vp
         JOIN "jarCsv" j ON j."jarKodas"::text = vp."jarKodas"
WHERE vp."paskelbimoData" >= CURRENT_DATE - INTERVAL '5 years'
GROUP BY vp."jarKodas", j.pavadinimas, vp."pirkimoBudas"
HAVING COUNT(*) >= 3
ORDER BY vp."jarKodas", totalVerteEUR DESC NULLS LAST
LIMIT 100;
```
