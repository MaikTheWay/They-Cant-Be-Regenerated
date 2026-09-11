# Auditoria de assets estáticos do CardConjurer

Arquivos analisados: **401**. Referências únicas: **4247**; referências dinâmicas/diretórios não verificáveis: **54**; referências de arquivos estáticas: **4193**; disponíveis diretamente ou por alias conhecido: **4167**; ausentes no pacote: **26**.

## Resumo por categoria

| Categoria | Referências | Disponíveis | Ausentes |
|---|---:|---:|---:|
| data | 544 | 543 | 1 |
| fonts | 8 | 8 | 0 |
| frames-and-masks | 3546 | 3523 | 23 |
| mana | 19 | 18 | 1 |
| other | 19 | 18 | 1 |
| symbols-watermarks | 57 | 57 | 0 |

## Referências ausentes

| Caminho | Categoria | Referenciado por |
|---|---|---|
| `/data/images/cardImages/storybook/maskStorybookRightHalf.png` | data | `public/data/scripts/versions/storybook/version.js` |
| `/img/frames/crystal/crowns/c.png` | frames-and-masks | `public/js/frames/packCrystal.js` |
| `/img/frames/custom/m15-eighth/nyx/c.png` | frames-and-masks | `public/js/frames/packM15EighthNyx.js` |
| `/img/frames/doubleFeature/crowns/l.png` | frames-and-masks | `public/js/frames/packDoubleFeature.js` |
| `/img/frames/doubleFeature/pt/l.png` | frames-and-masks | `public/js/frames/packDoubleFeature.js`, `public/js/frames/packDoubleFeatureTransform.js` |
| `/img/frames/doubleFeature/transform/crowns/l.png` | frames-and-masks | `public/js/frames/packDoubleFeatureTransform.js` |
| `/img/frames/ixalanCoin/a.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/ixalanCoin/c.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/ixalanCoin/crown/a.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/ixalanCoin/crown/c.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/ixalanCoin/pt/a.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/ixalanCoin/pt/c.png` | frames-and-masks | `public/js/frames/packIxalanCoin.js` |
| `/img/frames/m15/new/fullart/c.png` | frames-and-masks | `public/js/frames/packFullArtNew.js` |
| `/img/frames/m15/new/ll.png` | frames-and-masks | `public/js/frames/packM15LandsNew.js` |
| `/img/frames/m15/new/ub/c.png` | frames-and-masks | `public/js/frames/packUBNew.js` |
| `/img/frames/mh2/crowns/v.png` | frames-and-masks | `public/js/frames/packMH2.js` |
| `/img/frames/mh2/v.png` | frames-and-masks | `public/js/frames/packMH2.js` |
| `/img/frames/mh2/vpt.png` | frames-and-masks | `public/js/frames/packMH2.js` |
| `/img/frames/saga/ub/sagaMaskTitle.png` | frames-and-masks | `public/js/frames/packSagaUB.js` |
| `/img/frames/tardis/crowns/l.png` | frames-and-masks | `public/js/frames/packTARDIS.js` |
| `/img/frames/tardis/l.png` | frames-and-masks | `public/js/frames/packTARDIS.js` |
| `/img/frames/tarkir/c.png` | frames-and-masks | `public/js/frames/packTarkir.js` |
| `/img/frames/tarkir/pt/c.png` | frames-and-masks | `public/js/frames/packTarkir.js` |
| `/img/frames/token/Initiative/initiative.png` | frames-and-masks | `public/js/frames/packTokenInitiative.js` |
| `/js/frames/manaSymbolsbreakingNews.js` | mana | `public/js/frames/manaSymbolsBreakingNews.js` |
| `/js/frames/versionPlaneswalkerBoxTopper.js` | other | `public/js/frames/packPlaneswalkerBoxTopper.js` |

## Observações

O relatório cobre strings estáticas. Caminhos montados dinamicamente, URLs externas e recursos escolhidos por dados de runtime exigem validação no smoke test e no navegador. Os aliases registrados são somente os que apontam para arquivos existentes no pacote.
