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

- Single-bidder rate vs. CPV national average.
- Repeat winner in single-bidder tenders.
- Technical specification language that matches one brand/model; repeated exclusionary requirements (e.g. specific
  patents, small deviations).
- Use of overly narrow CPV codes or contract splitting to keep competition away.

## SQL Examples

```sql
-- Buyers with highest single-bidder rate per CPV category (spec rigging signal)
SELECT a."perkanciosiosOrganizacijosKodas" AS pirkejoKodas,
       j.pavadinimas                       AS pirkejas, LEFT (vp."bvpzKodai"[1], 3) AS cpvGrupe, COUNT(DISTINCT a.id) AS pirkimuKiekis, COUNT(DISTINCT CASE WHEN dalyviu.cnt = 1 THEN a.id END) AS vienasdalyvys, ROUND(100.0 * COUNT(DISTINCT CASE WHEN dalyviu.cnt = 1 THEN a.id END)
    / COUNT(DISTINCT a.id), 1) AS vienoDalyvioProcent
FROM "atn1ataskaitos" a
    JOIN "viesiejiPirkimai" vp
ON vp."pirkimoId" = a."pirkimoNumeris"
    JOIN "jarCsv" j ON j."jarKodas":: text = a."perkanciosiosOrganizacijosKodas"
    JOIN (
    SELECT "ataskaitaId", COUNT(*) AS cnt FROM "atn1dalyviai" GROUP BY "ataskaitaId"
    ) dalyviu ON dalyviu."ataskaitaId" = a.id
GROUP BY a."perkanciosiosOrganizacijosKodas", j.pavadinimas, LEFT (vp."bvpzKodai"[1], 3)
HAVING COUNT(DISTINCT a.id) >= 5
ORDER BY vienoDalyvioProcent DESC
LIMIT 30;
```
