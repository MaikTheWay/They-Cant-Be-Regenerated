# Tutorial de instalação e execução

Este tutorial explica como instalar e executar o **They Can't Be Regenerated** em computadores Windows e Linux. Os passos foram escritos para pessoas que não precisam ter experiência prévia com programação.

## 1. O que é necessário

O projeto é uma aplicação local. Você não precisa contratar um servidor nem criar uma conta para executá-lo.

| Ferramenta | Para que serve |
|---|---|
| **Node.js** | Executa as ferramentas JavaScript do projeto |
| **pnpm** | Instala as dependências do projeto |
| **Git** | Opcional; útil para baixar atualizações |
| **Navegador** | Abre a aplicação, como Chrome, Edge, Firefox ou Chromium |
| **Terminal** | Executa os comandos de instalação e inicialização |

Recomenda-se ter pelo menos **8 GB de RAM** e espaço livre suficiente para os assets do CardConjurer. O pacote completo pode ocupar vários gigabytes.

## 2. Baixar e extrair o projeto

Receba o arquivo ZIP completo do projeto ou clone o repositório e salve-o no computador.

### Windows

1. Localize o arquivo `.zip` no Explorador de Arquivos.
2. Clique nele com o botão direito.
3. Escolha **Extrair Tudo...**.
4. Escolha uma pasta simples, por exemplo:

```text
C:\Projetos\They-Cant-Be-Regenerated
```

5. Clique em **Extrair**.
6. Abra a pasta extraída e confirme que ela contém `package.json`, `src`, `public` e `README.md`.

Evite extrair o projeto em uma pasta com nomes muito longos ou muitos caracteres especiais.

### Linux

No gerenciador de arquivos, clique com o botão direito no ZIP e escolha **Extrair aqui**. Como alternativa, abra o Terminal, vá até a pasta que contém o ZIP e execute:

```bash
unzip They-Cant-Be-Regenerated-professional-final.zip
```

Se o comando `unzip` não existir, instale-o:

```bash
# Ubuntu, Debian, Linux Mint e derivados
sudo apt update
sudo apt install unzip
```

Depois entre na pasta extraída:

## 3. Instalar o Node.js

O Node.js é necessário para instalar e executar as ferramentas do projeto. Instale a versão **20 ou superior**.

### Windows

1. Abra [https://nodejs.org/](https://nodejs.org/).
2. Baixe a versão **LTS**.
3. Execute o instalador `.msi`.
4. Aceite as opções padrão.
5. Mantenha marcada a opção que adiciona o Node.js ao `PATH`.
6. Reinicie o PowerShell ou o Prompt de Comando depois da instalação.

Verifique a instalação abrindo o **PowerShell** e executando:

```powershell
node --version
npm --version
```

O primeiro comando deve mostrar `v20` ou uma versão mais recente.

### Linux: método recomendado com nvm

O `nvm` permite instalar e trocar versões do Node.js sem alterar arquivos importantes do sistema.

Abra o Terminal e execute:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Feche e abra o Terminal novamente. Depois execute:

```bash
nvm install 20
nvm use 20
node --version
npm --version
```

O primeiro comando de versão deve mostrar `v20` ou mais recente.

### Linux: instalação pelo gerenciador de pacotes

Em Ubuntu, Debian, Linux Mint e derivados, o método com `nvm` é preferível. Se você já usa Node.js pelo sistema, confirme que a versão é suficiente:

```bash
node --version
```

Se a versão for inferior a 20, use o método com `nvm` acima.

## 4. Instalar o pnpm

O projeto usa pnpm para instalar suas dependências.

Abra um novo PowerShell no Windows ou um novo Terminal no Linux e execute:

```bash
npm install --global pnpm
```

Confirme que funcionou:

```bash
pnpm --version
```

Se o comando mostrar uma versão, o pnpm está instalado corretamente.

## 5. Instalar as dependências do projeto

Entre na pasta que contém o arquivo `package.json`.

### Windows PowerShell

Exemplo:

```powershell
cd "C:\Projetos\They-Cant-Be-Regenerated"
pnpm install
```

Se o caminho tiver espaços, mantenha as aspas.

### Linux

Exemplo:

```bash
cd ~/They-Cant-Be-Regenerated
pnpm install
```

A instalação pode levar alguns minutos. Ao terminar, deve existir uma pasta chamada `node_modules`.

> Não feche o terminal enquanto o comando estiver em execução. A instalação pode baixar muitas dependências e assets relacionados ao editor.

## 6. Iniciar a aplicação em modo de desenvolvimento

O modo de desenvolvimento é o modo recomendado para começar. Ele permite que o Vite atualize a aplicação enquanto os arquivos são modificados.

Dentro da pasta do projeto, execute:

```bash
pnpm dev
```

O terminal exibirá um endereço parecido com:

```text
Local: http://localhost:5173/
```

Abra esse endereço no navegador.

Se a porta `5173` estiver ocupada, o Vite pode escolher outra porta, como `5174`. Use exatamente o endereço mostrado no terminal.

### Parar a aplicação

Volte ao terminal que está executando `pnpm dev` e pressione:

```text
Ctrl + C
```

No Windows, se aparecer uma pergunta de confirmação, responda `Y` e pressione Enter.

## 7. Usar a aplicação

1. Na etapa **Import & validate your deck**, cole sua decklist ou carregue um arquivo `.txt`, `.csv`, `.dek` ou `.dec`.
2. Clique em **Import & resolve**.
3. Aguarde a resolução das cartas.
4. Abra **Customize Art**.
5. Selecione uma carta na fila.
6. Escolha uma impressão e um idioma disponível.
7. Use **Open Editor** para editar a carta com o CardConjurer original.
8. Use **Use my own art** para carregar uma imagem local.
9. Na etapa 1, use **Save project** para salvar o projeto.
10. Na etapa **Print & Export**, configure o papel e gere o PDF.

O navegador pode pedir permissão para acessar arquivos quando você importar um projeto ou escolher uma imagem.

## 8. Salvar e abrir projetos

Na etapa 1, o botão **Save project** salva o arquivo com a extensão `.tcbgr.json`.

Em navegadores compatíveis, será aberta uma janela para você escolher:

- a pasta de destino;
- o nome do arquivo;
- o local onde o projeto será salvo.

Em navegadores sem suporte ao seletor nativo, o arquivo será colocado na pasta de downloads configurada no navegador.

Para reabrir um projeto:

1. Abra a aplicação.
2. Clique em **Open project**.
3. Selecione o arquivo `.tcbgr.json` ou `.json`.
4. Aguarde a restauração do projeto.

## 9. Limpar o cache

Na etapa 1, clique em **Clear cache** para remover dados temporários de resolução de cartas e impressões.

A limpeza do cache não deve ser usada como substituta de **Save project**. Para preservar seu trabalho, salve primeiro o projeto.

## 10. Executar os testes

Os testes verificam o parser, o layout de impressão e a separação entre as representações original, arte própria e CardConjurer.

No Windows PowerShell e no Linux, dentro da pasta do projeto, execute:

```bash
pnpm test -- --run
```

O resultado esperado termina com uma mensagem semelhante a:

```text
Test Files  1 passed
Tests       8 passed
```

## 11. Gerar o build de produção

O build cria uma versão otimizada para distribuição ou preview local:

```bash
pnpm run build
```

Se o comando terminar com `built in ...`, o build foi concluído. Um aviso sobre chunks maiores que 500 kB pode aparecer por causa do renderer CardConjurer e das bibliotecas de PDF. Esse aviso não significa que o build falhou.

Para testar o build:

```bash
pnpm run preview
```

Abra o endereço mostrado no terminal. Para encerrar, pressione `Ctrl + C`.

## 12. Verificação completa

Para executar todas as verificações disponíveis:

```bash
bash scripts/final-verification.sh
```

No Windows, esse script exige um ambiente compatível com Bash, como **Git Bash** ou **WSL**. Usuários iniciantes podem executar primeiro os comandos individuais:

```bash
pnpm exec tsc -b --pretty false
pnpm test -- --run
pnpm run build
```

A auditoria dos assets pode ser executada com:

```bash
python3 scripts/audit-cardconjurer-assets.py
```

Para os testes browser automatizados, é necessário ter Chromium instalado e iniciar a aplicação em preview. Esses testes não são necessários para uso normal da aplicação.

## 13. Problemas comuns

### `node` não é reconhecido

O Node.js não está instalado ou não foi adicionado ao `PATH`.

- Windows: feche e reabra o PowerShell após instalar o Node.js.
- Linux: feche e reabra o Terminal após instalar o `nvm`.
- Execute `node --version` novamente.

### `pnpm` não é reconhecido

Instale o pnpm novamente:

```bash
npm install --global pnpm
```

Depois feche e reabra o terminal.

### `pnpm install` falha por falta de espaço

O projeto inclui muitos assets locais. Libere espaço no disco e confirme o tamanho disponível. Não remova manualmente a pasta `public`, pois ela contém assets necessários do CardConjurer.

### Erro `ENOENT: uv_cwd`

Esse erro ocorre quando o terminal está apontando para uma pasta que foi apagada ou movida.

1. Feche o terminal atual.
2. Abra um terminal novo.
3. Entre novamente na pasta do projeto.
4. Execute `pnpm install`.

### `EADDRINUSE` ou porta ocupada

Outra aplicação está usando a porta do Vite. Use a porta indicada pelo Vite ou escolha outra:

```bash
pnpm dev -- --port 5174
```

### A página não abre

Confirme que o terminal ainda está executando `pnpm dev` ou `pnpm preview`. Depois copie o endereço completo exibido no terminal para o navegador.

### O PDF ou as imagens não aparecem

Confirme que você executou `pnpm install` dentro da pasta que contém `package.json` e que a pasta `public` está presente. Não execute a aplicação a partir de uma pasta interna como `src`.

### O projeto não salva diretamente em uma pasta escolhida

O seletor nativo depende do navegador. Use Chrome, Edge ou outro navegador baseado em Chromium para obter essa funcionalidade. Caso contrário, verifique a pasta de downloads do navegador.

## 14. Atualizar o projeto

Se o projeto tiver sido obtido por Git:

```bash
git pull
pnpm install
```

Se você recebeu um novo ZIP, extraia-o em uma pasta nova. Não misture arquivos de versões diferentes na mesma pasta.

## 15. Checklist rápido

Antes de pedir ajuda, confirme:

- [ ] Node.js 20 ou superior está instalado;
- [ ] `pnpm --version` funciona;
- [ ] Você está na pasta que contém `package.json`;
- [ ] `pnpm install` terminou sem erro;
- [ ] `pnpm dev` está ativo;
- [ ] Você abriu o endereço exibido pelo Vite;
- [ ] A pasta `public` está presente;
- [ ] Você salvou o projeto antes de limpar o cache;
- [ ] O PDF foi gerado somente depois que todas as cartas foram resolvidas.

## Referências

[1]: https://nodejs.org/en/download "Node.js Downloads"
[2]: https://pnpm.io/installation "pnpm Installation"
[3]: https://vite.dev/guide/ "Vite Guide"
[4]: https://www.gtk.org/docs/installations/windows/ "Windows development environment reference"
[5]: https://learn.microsoft.com/en-us/windows/terminal/ "Windows Terminal Documentation"
