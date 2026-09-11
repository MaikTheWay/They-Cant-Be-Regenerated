# Card Editor — Relatório de persistência, redesign e performance

**Status:** concluído e validado em 11 de setembro de 2026.

## Conclusão

A causa raiz do desaparecimento de frames foi identificada no comportamento original do CardConjurer, não em uma perda acidental do estado React. O handler original `textEdited()` agenda `autoFrame()` após cada alteração de texto. Quando o modo automático está ativo, as funções de composição, como `autoM15Frame()`, limpam `card.frames` e recriam as camadas a partir do texto atual. Essa reconstrução destrutiva substituía uma composição que o usuário já havia editado.

A integração agora trata o documento do CardConjurer como a fonte de verdade da sessão. O bridge desativa o Auto Frame implícito depois de criar ou restaurar um documento. A seleção manual de frame continua disponível. Alterações de texto, artwork e propriedades passam a modificar somente o estado correspondente do documento original. O documento estruturado continua sendo salvo, restaurado e usado para a renderização final do PDF.

## Causa raiz e correção

| Área investigada | Comportamento encontrado | Correção aplicada |
|---|---|---|
| React lifecycle | `CardConjurerEditor` dependia somente de `card.id` para inicializar o iframe. A atualização do card não causava remount do editor. | Mantida essa propriedade, pois ela preserva o iframe durante salvamentos e atualizações de Stage 2. |
| Bridge | `createBlank()` é destrutivo por definição, mas também existia uma segunda chamada potencial durante inicialização de documentos inválidos. | `loadDocument()` agora retorna sucesso depois de criar um blank válido, evitando uma segunda reconstrução no handler. |
| CardConjurer original | `textEdited()` chama `autoFrameBuffer()`, que agenda `autoFrame()`. As funções de Auto Frame executam `card.frames = []`. | O bridge desativa o Auto Frame implícito após `createBlank()` e `loadDocument()`. A escolha manual continua disponível no controle original. |
| Artwork | `uploadArt()` atualiza a arte e redesenha o documento em vez de criar uma nova carta. | O bridge preserva as demais propriedades e desativa o Auto Frame implícito antes da alteração. |
| Persistência | O estado completo era salvo em `cardConjurerDocument`, com preview separado para a Stage 2. | Esse modelo foi mantido. O preview é apenas derivado; o documento estruturado é a fonte de verdade. |
| Renderização | O renderer oculto é montado uma vez no App e reutilizado durante o PDF. | Não foi introduzido um novo iframe por carta ou por alteração. |

A correção não restaura frames depois que eles desaparecem. Ela impede a reconstrução automática que os removia. Essa diferença é importante porque mantém a composição atual como estado autoritativo.

## Arquitetura de estado

O fluxo atual possui três níveis de estado. O documento CardConjurer vive no iframe original durante a edição. O adapter transporta snapshots estruturados entre o iframe e o host. O `CardDefinition.cardConjurerDocument` armazena o último snapshot salvo para persistência e reabertura.

```text
CardConjurer original
    │  edição incremental no objeto window.card
    │  save/render snapshot
    ▼
CardConjurerAdapter
    │  postMessage tcbr:document
    ▼
CardDefinition.cardConjurerDocument
    │  normalizeProject / serializeProject
    ▼
localStorage + arquivo .tcbgr.json
```

O preview PNG continua sendo mantido em `editorPreviewDataUrl` para exibição rápida na Stage 2. Ele não substitui o documento estruturado. Durante a exportação, o PDF chama o renderer CardConjurer quando a representação ativa é `editor`.

## Save, load e recovery

O storage agora possui `saveProjectWithRecovery()`. A função normaliza o projeto e serializa o JSON uma única vez antes de atualizar as chaves de recovery e de projeto. Isso elimina a normalização e a serialização duplicadas do autosave anterior.

A normalização de cards preserva campos desconhecidos do documento CardConjurer porque parte do objeto persistido original antes de aplicar defaults do domínio. Isso mantém compatibilidade com propriedades adicionais, layers e configurações visuais que o renderer original acrescentar ao documento.

## Redesign visual

A plataforma recebeu uma camada visual de estúdio com densidade maior e menos aparência de dashboard. O redesign usa fundo grafite, linhas discretas, acento âmbar, cantos pequenos e painéis compactos. A Stage 2 passou a priorizar uma coluna funcional de seleção de cartas e um painel amplo de composição.

As principais mudanças visuais são:

| Superfície | Mudança |
|---|---|
| Shell da aplicação | Redução de gradientes, arredondamentos e elementos decorativos. |
| Stage 2 | Coluna de fila fixa e painel de arte com maior área útil. |
| Representações | Botões de Original Print, Open Editor e Use My Own Art tratados como ferramentas, não como cards promocionais. |
| Painel de arte | Separação mais clara entre representação, idioma e impressões. |
| CardConjurer | Canvas ampliado, menu lateral rolável, tabs compactas e contraste de ferramenta profissional. |
| Responsividade | Em telas menores, a fila passa para cima e o painel de edição ocupa a largura disponível. |

O renderer e os assets originais do CardConjurer não foram substituídos. O redesign atua no shell da integração e nos estilos do workspace original.

## Performance bottlenecks encontrados

O gargalo de maior severidade era a reconstrução automática de frames. Além de ser um bug de estado, ela provocava trabalho de composição, carregamento de packs e redesenho de canvas durante cada alteração textual.

O segundo gargalo era o autosave duplicado. Cada alteração normalizava e serializava o projeto duas vezes em sequência. O terceiro era a conversão repetida de URLs de imagem para data URLs durante exportações com cartas que compartilham a mesma imagem.

| Severidade | Gargalo | Impacto |
|---|---|---|
| Critical | `textEdited()` → `autoFrameBuffer()` → `autoFrame()` → `card.frames = []` | Perda de estado e recomposição do canvas durante edição. |
| High | Autosave com duas chamadas completas de `saveProject()` | Serialização e escrita duplicadas em cada ciclo de 800 ms. |
| Medium | Download, decode e canvas conversion repetidos por URL de imagem | Maior latência e pressão de memória na exportação de decks repetidos. |
| Medium | Recomposição de preview compactado em salvamentos equivalentes | Trabalho de decode e resize desnecessário. |
| Low | Chunk principal grande no build | O bundle continua funcional, mas há oportunidade futura de code splitting. |

## Otimizações realizadas

O Auto Frame implícito foi desligado no bridge depois da criação e restauração de documentos. Essa é a otimização de maior impacto porque elimina o ciclo destrutivo e o trabalho de reconstrução associado.

O autosave agora usa uma única normalização e uma única serialização. A conversão de preview usa cache local por conteúdo da imagem. A exportação mantém cache de imagem por URL durante a sessão, evitando downloads e decodificações duplicadas para a mesma fonte.

O iframe do CardConjurer continua montado enquanto a carta selecionada não muda. Alterações do card e salvamentos não alteram a chave do componente. O host oculto de renderização do PDF também continua reutilizado.

## Métricas observadas

A regressão browser validou um documento que começou com seis frames, recebeu uma nova camada e terminou com sete frames. O número de frames permaneceu estável durante alterações de artwork, título, mana, tipo, rules text e power/toughness.

| Métrica | Resultado |
|---|---:|
| Testes unitários | 8 passaram |
| TypeScript | passou |
| Build de produção | passou |
| Frames iniciais na regressão | 6 |
| Frames finais após nova camada e edições | 7 |
| Documento estruturado persistido | sim |
| Reabertura após Save/Close | passou |
| Troca Original Print → Editor | passou |
| PDF validado no smoke existente | passou |
| Bundle CSS produzido | 43.03 kB bruto / 9.33 kB gzip |
| Bundle principal produzido | 652.90 kB bruto / 209.50 kB gzip |

O tempo do build variou entre execuções por causa dos hooks do ambiente Vite. Por isso, não é apresentado como benchmark confiável de runtime da aplicação. A regressão de estado é o indicador principal desta etapa.

## Testes executados

Os testes unitários foram executados com `pnpm test -- --run`. O typecheck foi executado com `pnpm exec tsc -b --pretty false`. O build foi executado com `pnpm run build`.

O fluxo obrigatório de persistência foi automatizado em `scripts/cardconjurer-state-regression.py`. O teste criou um documento, adicionou frame e artwork, alterou Title, Mana Cost, Type, Rules Text e Power/Toughness, salvou, retornou à Stage 2, alternou para Original Print, voltou ao Editor e verificou o documento restaurado.

O smoke existente em `scripts/cardconjurer-smoke.py` também passou e confirmou renderização do canvas original, persistência do documento e exportação PDF validada.

## Limitações restantes

O Auto Frame manual continua sendo uma operação destrutiva do CardConjurer original quando o usuário o seleciona explicitamente. Ele não é mais acionado implicitamente durante edição integrada. Essa distinção preserva a compatibilidade com o recurso original sem permitir que alterações comuns destruam a composição.

O bundle principal ainda supera 500 kB após minificação. A próxima otimização recomendável é separar o pipeline PDF e o código do editor por carregamento sob demanda. Essa mudança não foi aplicada nesta etapa porque exigiria alterar o carregamento do iframe e o fluxo de exportação além do escopo necessário para corrigir o gargalo crítico.

## Arquivos modificados

| Arquivo | Responsabilidade |
|---|---|
| `public/cardconjurer/bridge.js` | Preservação incremental de frames, arte e documentos durante o lifecycle original. |
| `src/core/storage.ts` | Autosave com normalização e serialização únicas. |
| `src/App.tsx` | Uso do autosave otimizado e cache de preview compactado. |
| `src/core/pdfExport.ts` | Cache de conversão de imagens por URL. |
| `src/styles/app.css` | Redesign do shell e da Stage 2. |
| `public/css/style-9.css` | Redesign do workspace interno do CardConjurer sem alterar o renderer. |
| `scripts/cardconjurer-state-regression.py` | Regressão end-to-end de estado, save/load e troca de representação. |

## References

[1]: https://react.dev/learn/preserving-and-resetting-state "React — Preserving and Resetting State"

[2]: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage "MDN — Window.localStorage"

[3]: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API "MDN — Canvas API"
