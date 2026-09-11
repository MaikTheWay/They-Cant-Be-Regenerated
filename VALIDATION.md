# Relatório de validação

## 1. Objetivo

Este documento registra os procedimentos utilizados para verificar a integração do CardConjurer, o fluxo de persistência, a interface da Stage 2, a resolução de idiomas, a exportação de projetos e o pipeline de geração de PDF.

A validação cobre o modo web local. O empacotamento nativo Tauri depende de Rust/Cargo instalado no ambiente de execução.

## 2. Resultado executivo

A versão atual foi compilada, testada e validada com sucesso no pipeline web.

| Área | Resultado |
|---|---|
| TypeScript | Aprovado |
| Testes unitários | 8 testes aprovados |
| Build de produção | Aprovado |
| Integração CardConjurer | Aprovada |
| Persistência estruturada | Aprovada |
| Filtro de idioma | Aprovado |
| Layout da Stage 2 | Aprovado |
| Auditoria de assets | Executada |
| Tauri nativo | Não executado; Cargo indisponível no ambiente |

## 3. Procedimentos automatizados

Os comandos abaixo reproduzem as verificações principais:

```bash
pnpm install --no-frozen-lockfile
pnpm exec tsc -b --pretty false
pnpm test -- --run
pnpm run build
python3 scripts/audit-cardconjurer-assets.py
bash scripts/final-verification.sh
```

Resultado registrado do pipeline consolidado:

```text
FINAL_STATUS=0
```

O build pode emitir um aviso informativo sobre chunks maiores que 500 kB. Esse aviso decorre do renderer CardConjurer e das bibliotecas de PDF; não representa falha de compilação.

## 4. Testes unitários

O conjunto unitário atual contém oito testes em `src/core/core.test.ts`.

| Grupo | Cobertura |
|---|---|
| Parser | Quantidade, comentários, separadores, metadados e aliases de idioma |
| Layout de impressão | Grade A4, quantidade expandida, terrenos básicos e papel customizado |
| Representações | Independência entre impressão original, arte própria e documento CardConjurer |

Execução:

```bash
pnpm test -- --run
```

Resultado: **1 arquivo de teste e 8 testes aprovados**.

## 5. CardConjurer

O editor utiliza o host HTML, o bridge, o creator, o renderer, os frames, os templates, os símbolos, as fontes e os assets locais do CardConjurer original.

A regressão de estado verifica:

- inicialização do canvas vazio;
- carregamento do pack padrão;
- renderização do canvas;
- preservação dos frames internos;
- persistência de título, mana cost, type, rules text e power/toughness;
- persistência de artwork;
- save, close e reopen;
- alternância entre Original Print e Editor;
- restauração do documento estruturado;
- exportação posterior para PDF.

O comportamento especial da lista de frames também foi verificado. Ao iniciar o editor, `#frame-list` possui zero itens visuais, enquanto `card.frames` continua contendo os frames necessários para o renderer. Essa separação evita alterar o resultado visual ou o documento salvo.

Comando:

```bash
CDP_PORT=9233 python3 scripts/cardconjurer-state-regression.py
```

Resultado estruturado observado:

```json
{
  "ok": true,
  "initialFrames": 6,
  "finalFrames": 7,
  "structuredDocumentPersisted": true,
  "originalToggleRoundTrip": true
}
```

## 6. Stage 2 e experiência de uso

A regressão da Stage 2 verifica a composição full-width, a ausência da tabela lateral `PROJECT`, a separação entre a fila de cartas e o painel da carta selecionada, a divisão entre cartas normais e terrenos e a ausência de sobreposição.

A grade de artes utiliza até seis colunas em telas largas e reduz conforme o viewport. A filtragem de idioma remove da visualização as impressões que não correspondem à língua selecionada.

Comando:

```bash
CDP_PORT=9232 python3 scripts/stage2-layout-regression.py
```

Resultado registrado:

```json
{
  "ok": true,
  "sidebar": false,
  "queue": true,
  "selected": true,
  "normalRows": 3,
  "landRows": 1,
  "columns": 3,
  "stage2Overlap": false,
  "languageFilter": {
    "selected": "pt",
    "cards": "all Portuguese / pt-BR"
  }
}
```

## 7. Idiomas e resolução de impressões

O idioma é normalizado entre os códigos do provider e os aliases aceitos na importação. O código `pt` representa Português do Brasil na camada de interface.

A interface não oferece mais um estado vazio denominado `All languages`. O seletor inicia em um idioma disponível e o handler rejeita valores vazios. Esse comportamento impede a consulta inválida que anteriormente produzia a mensagem:

```text
Nenhuma impressão em foi encontrada para esta carta.
```

## 8. Persistência e arquivos de projeto

A persistência local utiliza `localStorage` e recovery automático. O formato exportado é `.tcbgr.json`.

Na Stage 1:

- **Open project** abre o seletor de arquivo do navegador;
- **Save project** utiliza `showSaveFilePicker` quando disponível, permitindo escolher diretório e nome;
- navegadores sem essa API usam o download convencional;
- **Clear cache** remove o cache de cartas e impressões sem apagar o projeto corrente.

A serialização remove objetos transitórios do DOM, Canvas, Image e Context antes de persistir o documento CardConjurer.

## 9. Exportação PDF

O pipeline calcula dimensões físicas em milímetros, aplica papel, orientação, margens, escala, espaçamento, sangria, marcas de corte e marca d'água. As cartas editadas são renderizadas pelo host CardConjurer e validadas antes do download do PDF.

O fluxo é bloqueado quando existem cartas não resolvidas. A validação do Blob confirma a estrutura esperada antes de apresentar o arquivo ao usuário.

## 10. Auditoria de assets

A auditoria reproduzível está disponível em `docs/cardconjurer-assets-audit.md` e `docs/cardconjurer-assets-audit.json`.

A execução anterior analisou 401 arquivos, 4.247 referências únicas, 4.193 referências estáticas e 54 referências dinâmicas ou não-file. Foram encontradas 4.167 referências disponíveis. As referências ausentes ou dinâmicas permanecem registradas no relatório de auditoria.

## 11. Limitação do build nativo

O ambiente de validação possui Node.js e pnpm, mas não possui Cargo. Portanto, o build Tauri não foi executado neste ambiente.

Em uma máquina com Rust instalado, execute:

```bash
pnpm tauri build
```

## 12. Referências e artefatos

- [`README.md`](README.md): instalação, arquitetura, execução e APIs;
- [`INTEGRATION_REPORT.md`](INTEGRATION_REPORT.md): integração do CardConjurer;
- [`STAGE2_IMPLEMENTATION_REPORT.md`](STAGE2_IMPLEMENTATION_REPORT.md): implementação da Stage 2;
- [`docs/state-persistence-ui-performance-report.md`](docs/state-persistence-ui-performance-report.md): persistência e performance;
- [`docs/cardconjurer-assets-audit.md`](docs/cardconjurer-assets-audit.md): auditoria dos assets.

## Referências externas

[1]: https://scryfall.com/docs/api "Scryfall API Documentation"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker "MDN showSaveFilePicker"
[3]: https://v2.tauri.app/ "Tauri Documentation"
