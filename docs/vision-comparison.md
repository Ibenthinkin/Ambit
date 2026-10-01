# Vision comparison — claude-haiku-4-5-20251001 against the stored scores (10-01-26)

280 pictures compared, 20 excluded (image not fetched, or the judgment failed).

- mean score: stored 6.28 → new 6.08
- mean absolute difference: 1.20
- Spearman rank agreement: 0.72
- within one point: 71%
- scoring 8 or more: stored 44% → new 38%

Proposed bar (D8): Spearman ≥ 0.60, mean shift within ±0.5, no source shifting more than 1.0. The verdict is Ben's.

## By source (largest shift first)

| source | n | shift | MAE |
| --- | --- | --- | --- |
| archive | 17 | -1.53 | 1.53 |
| thisiscolossal | 16 | -1.44 | 1.94 |
| aic | 1 | -1.00 | 1.00 |
| 70sscifiart | 17 | +0.88 | 1.35 |
| nasa-images | 17 | -0.71 | 0.94 |
| wellcome | 16 | -0.69 | 1.44 |
| thevaultoftheatomicspaceage | 16 | -0.63 | 1.13 |
| thisisnthappiness | 16 | -0.63 | 1.38 |
| sovietpostcards | 16 | +0.56 | 1.06 |
| doorofperception | 17 | +0.24 | 2.12 |
| pdr | 17 | +0.18 | 0.76 |
| met | 14 | +0.14 | 0.71 |
| cma | 17 | +0.12 | 0.94 |
| kvetchlandia | 17 | +0.12 | 1.29 |
| loc | 17 | -0.12 | 0.24 |
| thingsorganizedneatly | 15 | +0.07 | 1.40 |
| smithsonian | 17 | +0.06 | 1.35 |
| jareckiworld | 17 | +0.00 | 0.82 |

## The largest disagreements — look at these

- stored **8**, new **2** — doorofperception: [Sasha Shulgin’s Notebooks and lab records](http://localhost:3000/i/DZkpjw4I0W-aWKDBEJArL)
- stored **3**, new **8** — doorofperception: [Alexey Kashpersky The Uncanny Body](http://localhost:3000/i/Qt6Qpf292tZsCkSwYsBTO)
- stored **8**, new **3** — archive: [Underwater coral reef scene with sea turtles](http://localhost:3000/i/rliJ9-k0fzcQcHMNLOyc-)
- stored **3**, new **8** — doorofperception: [Toshio Saeki Nothing is True Everything is Permitted](http://localhost:3000/i/foT_wC3MLCnZX1gOtG0pp)
- stored **4**, new **8** — cma: [Concealed Drawer for a Globe Work Table (Globustisch)](http://localhost:3000/i/6qHmc17soQVEG3fIIwek_)
- stored **6**, new **2** — thisisnthappiness: [How I met your mother, Caroline Furneaux](http://localhost:3000/i/uoWd0DpWCUzwMCN2uGIXx)
- stored **2**, new **6** — 70sscifiart: [70s Sci-Fi Art](http://localhost:3000/i/cKfcJfYmD-q-zi8dEa73l)
- stored **5**, new **9** — kvetchlandia: [Roman Vishniac Mara Vishniac, Roman’s Daughter, Posing in Front of An ](http://localhost:3000/i/PyfjOhu59-lpGteC8BN0g)
- stored **8**, new **4** — archive: [Tiger snarling in the snow](http://localhost:3000/i/I163JJ72nwCST6tsLGPSF)
- stored **3**, new **7** — doorofperception: [Yoshifumi Hayashi The Eternal Hunger of All Things](http://localhost:3000/i/LebEJMsxxuJFH1QjRn8Hw)
- stored **4**, new **8** — smithsonian: [Pendant in Shape of Two Heads (Bacchus and Hermes) Back to Back](http://localhost:3000/i/YFj7ZAqle2rov9FEgCwvr)
- stored **8**, new **4** — thisiscolossal: [Art Historical Masterworks Come Alive at Annual Halloween Parade in Ka](http://localhost:3000/i/_sOiLtkKvZqlJl8fWOhxh)
- stored **7**, new **3** — wellcome: [A junior course of practical zoology / by the late A. Milnes Marshall ](http://localhost:3000/i/kpw4_UH5skEE-iUNvmefv)
- stored **6**, new **2** — thevaultoftheatomicspaceage: [https://ko-fi.com/thevault](http://localhost:3000/i/CsiBtSEgCquPQzYt-6heX)
- stored **6**, new **2** — thevaultoftheatomicspaceage: [https://ko-fi.com/thevault](http://localhost:3000/i/Lt9ZoBinoAe29nhOx1Kj6)
- stored **6**, new **2** — thisiscolossal: [Shape the Future of Art, Design, and Architecture at Cranbrook Academy](http://localhost:3000/i/TZvaFDZ1c2EekatbB9Npa)
- stored **4**, new **8** — kvetchlandia: [Jeff Pott Shirley, Los Angeles 2017](http://localhost:3000/i/wLBHBfdUmRuTtDMTGR3vM)
- stored **8**, new **5** — thisisnthappiness: [Work in progress, David Molesky](http://localhost:3000/i/2wFjipLwnXDwzTjJBmVDa)
- stored **5**, new **8** — 70sscifiart: [Bob Eggleton](http://localhost:3000/i/zrIilDKjZaBHjIJ1E_33F)
- stored **6**, new **3** — kvetchlandia: [This is the Bass I’ve Been Playing Lately, a Gretsch G2202.](http://localhost:3000/i/kDKkLXh1YKLjUUL83EsfF)
