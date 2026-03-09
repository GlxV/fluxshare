# FluxShare 2.0

FluxShare 2.0 e um app desktop para compartilhamento rapido de arquivos com foco oficial em Windows. A release estavel desta fase prioriza Windows 10 e Windows 11, com UX, integracoes de shell e fluxo de distribuicao pensados primeiro para esse ambiente.

O projeto continua sendo um monorepo com `pnpm`, mas a narrativa da release agora e simples: o produto principal e o app Windows.

## Escopo da release estavel

- Plataforma oficial: Windows 10/11
- Fluxo principal: `Send File`, `P2P` e `Settings`
- Compartilhamento: envio rapido local, P2P e link publico via tunel
- Integracoes nativas: menu de contexto do Explorer e empacotamento desktop

Linux e macOS nao foram removidos do codigo, mas nao sao o foco oficial da release 2.0. Eles devem ser tratados como caminhos experimentais ou de adaptacao manual.

## Destaques do FluxShare 2.0

- Importacao mais robusta para arquivos pesados, com feedback real e menos sensacao de travamento
- Fluxo de tunel mais consistente, com estados mais confiaveis e validacao de disponibilidade
- Pagina publica de arquivo redesenhada, com preview inline mais rico
- UI do app refinada, com tema modular, presets adicionais e melhor consistencia entre abas
- Integracao opcional com o menu de contexto do Windows Explorer

## Requisitos para desenvolvimento

### Windows

- Windows 10 ou Windows 11
- Node.js 20+
- `pnpm` 8+
- Rust toolchain estavel
- Microsoft WebView2 Runtime
- `cloudflared` no `PATH` se voce quiser testar compartilhamento via tunel publico

### Instalar dependencias

```powershell
pnpm install
```

## Rodando o app

### App desktop

```powershell
pnpm tauri:dev
```

### Servidor de sinalizacao P2P

Se voce quiser validar a parte de sinalizacao localmente:

```powershell
pnpm signaling:dev
```

## Gerando a release Windows

```powershell
pnpm tauri:build
```

Os artefatos de release do Tauri ficam dentro de `apps/client/src-tauri/target/release/` e `apps/client/src-tauri/target/release/bundle/`.

## Linux e macOS: estado atual

Linux e macOS continuam possiveis para experimentacao, mas nao fazem parte da superficie oficialmente estabilizada no FluxShare 2.0.

Se voce quiser tentar rodar nesses sistemas:

- instale as dependencias nativas do Tauri para o seu SO
- valide manualmente o pipeline de build desktop
- adapte as integracoes especificas de Windows, como Explorer/context menu
- revise caminhos, permissao de arquivos e comportamento do tunel no ambiente alvo

Em outras palavras: o core do app pode ser reaproveitado, mas a release estavel atual nao promete o mesmo nivel de acabamento fora do Windows.

## Estrutura do monorepo

- `apps/client`: app desktop Tauri + frontend React
- `apps/client/src-tauri`: backend Rust, empacotamento e integracoes nativas
- `apps/signaling-server`: servidor de sinalizacao usado no fluxo P2P

## Comandos uteis

```powershell
pnpm install
pnpm tauri:dev
pnpm tauri:build
pnpm signaling:dev
pnpm signaling:build
```

## Licenca

FluxShare esta licenciado sob `GPL-3.0-or-later`. Veja [LICENSE](LICENSE).
