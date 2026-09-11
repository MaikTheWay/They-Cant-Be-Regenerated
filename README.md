# They Can't Be Regenerated

Aplicação local para importar decks de **Magic: The Gathering**, resolver cartas e impressões, selecionar idiomas e artes, editar cartas com o **CardConjurer original** e gerar PDFs para impressão.

O sistema foi desenvolvido com abordagem local-first. O conteúdo do projeto, os documentos do editor, os previews e a configuração de impressão permanecem no ambiente do usuário. Não existe backend próprio obrigatório nem conta de usuário.

## Escopo funcional

| Etapa | Função | Saída |
|---|---|---|
| **Import & Validate** | Importação, parsing, agregação e resolução da decklist | Definições de cartas validadas |
| **Customize Art** | Seleção de impressão, idioma, arte própria e edição nativa | Representação visual persistida por carta |
| **Print & Export** | Configuração física, preview e geração do PDF | PDF validado para impressão |

A aplicação separa a identidade da carta, a impressão selecionada, a arte própria e o documento CardConjurer. Uma alteração em uma representação não elimina as outras.

## Funcionalidades

- Importação de listas `.txt`, `.csv`, `.dek` e `.dec`;
- Reconhecimento de quantidade, metadados de coleção e número de coletor;
- Resolução de cartas e impressões pela API pública do Scryfall;
- Seleção de idioma com filtragem das artes disponíveis;
- Suporte a impressões de dupla face;
- Uso da imagem oficial da impressão;
- Upload de arte própria em PNG, JPEG ou WEBP;
- Editor CardConjurer original integrado localmente;
- Frames, máscaras, símbolos, fontes, templates e renderer originais;
- Persistência do documento estruturado do CardConjurer;
- Recovery automático da última sessão;
- Importação e exportação de projetos `.tcbgr.json`;
- Seleção nativa do caminho de salvamento quando o navegador oferece File System Access API;
- Geração de PDF com dimensões físicas, sangria, marcas de corte, margens, escala, espaçamento e marca d'água;
- Validação do Blob PDF antes do download.

## Requisitos

- Node.js 20 ou superior;
- pnpm 9 ou superior;
- Navegador moderno com suporte a módulos ES, Canvas, `localStorage` e File API;
- Chromium ou navegador baseado em Chromium é recomendado para o diálogo nativo de salvamento. Navegadores sem essa API usam download convencional.

## Instalação

```bash
pnpm install
```

O arquivo `pnpm-lock.yaml` registra as versões resolvidas. A pasta `node_modules` não é distribuída e deve ser recriada localmente.

## Desenvolvimento

```bash
pnpm dev
```

O Vite disponibiliza a aplicação em `http://localhost:5173`. Para acesso por outra máquina na rede local:

```bash
pnpm dev -- --host 0.0.0.0
```

## Build e preview

```bash
pnpm run build
pnpm run preview
```

O build executa o TypeScript incremental e gera os artefatos estáticos em `dist/`. O preview serve somente o resultado compilado.

## Testes e validação

Testes unitários:

```bash
pnpm test -- --run
```

Verificação consolidada:

```bash
bash scripts/final-verification.sh
```

A verificação consolidada executa instalação, typecheck, testes, build e auditoria dos assets.

| Script | Escopo |
|---|---|
| `scripts/cardconjurer-smoke.py` | Inicialização do editor, renderer, persistência e exportação |
| `scripts/cardconjurer-state-regression.py` | Persistência incremental de texto, arte, frames e reabertura |
| `scripts/cardconjurer-regression.py` | Regressão geral da integração CardConjurer |
| `scripts/stage2-layout-regression.py` | Layout da Stage 2, separação entre cartas e terrenos e filtro de idioma |
| `scripts/stage2-assets-regression.py` | Idiomas e uploads reais no editor |
| `scripts/audit-cardconjurer-assets.py` | Auditoria de referências e assets locais |

Os testes browser utilizam Chromium headless com CDP quando é necessária uma validação end-to-end.

## Arquitetura

O frontend é uma aplicação React + TypeScript construída com Vite. O domínio está concentrado em `src/core/`, os componentes React em `src/components/` e a composição principal em `src/App.tsx`.

| Diretório | Responsabilidade |
|---|---|
| `src/core/models.ts` | Modelos de projeto, carta, impressão, arte e representação |
| `src/core/deckParser.ts` | Parsing e agregação da decklist |
| `src/core/cardResolver.ts` | Resolução de cartas, impressões, idiomas e cache |
| `src/core/storage.ts` | Persistência local, recovery e serialização |
| `src/core/cardConjurerAdapter.ts` | Contrato entre o domínio e o editor |
| `src/core/pdfExport.ts` | Layout físico, renderização e validação do PDF |
| `src/components/CardConjurerEditor.tsx` | Sessão integrada do editor |
| `public/cardconjurer/` | Host HTML e bridge do CardConjurer |
| `public/js/` | Creator, renderer, frames e scripts originais |
| `public/data/` e `public/fonts/` | Fonts, dados, símbolos e assets locais |
| `src-tauri/` | Configuração opcional do empacotamento Tauri |

### Fluxo de dados

```text
Decklist
   │
   ▼
Parser e agregação
   │
   ▼
CardDefinition
   ├── impressão original
   ├── arte própria
   └── CardConjurerDocument
             │
             ▼
   iframe CardConjurer original
             ├── preview da Stage 2
             └── render de alta resolução para PDF

ProjectFile ── localStorage / recovery / .tcbgr.json
```

## Integração com o CardConjurer

A Stage 2 hospeda o CardConjurer original localmente. O projeto não substitui o renderer por um mock nem recria o editor em React.

O bridge local é responsável por:

1. inicializar um canvas vazio;
2. carregar o pack padrão de frames;
3. aplicar arte própria ou documento persistido;
4. serializar o estado sem objetos transitórios do DOM;
5. devolver uma prévia para a interface;
6. renderizar a carta em alta resolução para o PDF;
7. preservar frames durante edições de texto;
8. iniciar a lista visual de reorder vazia sem remover os frames internos necessários ao renderer.

## APIs e serviços externos

A API pública do Scryfall fornece dados de cartas, impressões, imagens e idiomas [1]. As consultas são armazenadas em cache localmente e possuem controle de intervalo para reduzir requisições repetidas.

| Serviço | Finalidade | Obrigatoriedade |
|---|---|---:|
| Scryfall API | Resolução de cartas, impressões e imagens | Necessário para resolução online |
| CardConjurer local | Edição e renderização | Necessário para edição |
| Browser File API | Importação e exportação de arquivos | Necessário |
| Tauri | Empacotamento desktop | Opcional |

O projeto não envia o arquivo de projeto para um servidor próprio. Os assets do CardConjurer são distribuídos localmente.

## Persistência

O estado persistido é representado por `ProjectFile`. Ele contém o texto de origem, as cartas resolvidas, as configurações de impressão, o recovery e os dados de representação visual.

Cada carta pode conter:

- dados oficiais resolvidos;
- impressão e idioma selecionados;
- arte própria em Data URL;
- documento serializado do CardConjurer;
- preview compactado;
- transformação e representação ativa.

O formato de projeto usa a extensão `.tcbgr.json`. Arquivos inválidos são rejeitados antes de substituir o estado atual.

## Salvamento de projetos

Na Etapa 1, **Save project** usa `showSaveFilePicker` quando disponível. Isso permite escolher diretório e nome do arquivo no diálogo do sistema. Em navegadores incompatíveis, a aplicação usa o download padrão do navegador.

**Open project** importa arquivos `.json` e `.tcbgr`. O botão de cache limpa os dados locais de resolução de cartas e impressões sem remover o documento corrente do projeto.

## Exportação PDF

O motor de exportação calcula dimensões em milímetros e posiciona as cartas de acordo com papel, orientação, margens, escala e espaçamento. Cartas editadas são renderizadas pelo host CardConjurer oculto para que o PDF não dependa do estado visual da tela.

O Blob final é validado antes do download. A exportação é bloqueada quando existem cartas não resolvidas.

## Limitações conhecidas

O bundle principal pode exceder o limite informativo de 500 kB do Vite devido ao renderer CardConjurer, `html2canvas` e às bibliotecas PDF. Esse aviso não impede o build nem a execução.

O diálogo nativo de diretório depende do navegador. O fallback de download não permite que a aplicação escolha diretamente uma pasta arbitrária.

O empacotamento nativo Tauri depende da instalação local do toolchain Rust e das ferramentas do sistema operacional.

## Licenças e terceiros

O código de integração deste projeto deve ser distinguido do código e dos assets originais do CardConjurer. As licenças, avisos e condições de uso distribuídos com os assets devem ser preservados em qualquer redistribuição.

## Referências

* [Scryfall API Documentation][1]
* [Vite Guide][2]
* [Tauri Documentation][3]
* [MDN — showSaveFilePicker][4]

[1]: https://scryfall.com/docs/api "Scryfall API Documentation"
[2]: https://vite.dev/guide/ "Vite Guide"
[3]: https://v2.tauri.app/ "Tauri Documentation"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker "MDN showSaveFilePicker"

