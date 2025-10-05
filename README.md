# FluxShare

FluxShare é um cliente desktop multiplataforma (Windows/Linux/macOS) para transferência de arquivos P2P com fallback automático para QUIC e Cloudflare Tunnel. O projeto é distribuído sob a licença MIT e organizado como um monorepo com pnpm.

## Pré-requisitos

- [Node.js 20+](https://nodejs.org/) com pnpm (`corepack enable`)
- [Rust](https://www.rust-lang.org/) stable (via rustup)
- Dependências do Tauri (ver [documentação oficial](https://tauri.app/v1/guides/getting-started/prerequisites))
- `cloudflared` disponível no `PATH`

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
pnpm dev
```

Este comando inicia o servidor de sinalização (`apps/signaling-server`) e o cliente Tauri (`apps/client`). O cliente abre a interface React com as páginas:

- Enviar
- Receber
- Peers
- Tunnel
- Configurações
- Logs

### Configuração do servidor de sinalização

O servidor de sinalização lê a porta da variável de ambiente `PORT`, usando `4000` como padrão. Para ajustar a configuração localmente:

1. Copie `apps/signaling-server/.env.example` para `apps/signaling-server/.env`.
2. Edite o valor de `PORT` conforme necessário.

Durante os testes e em desenvolvimento, o servidor continuará funcionando caso o arquivo `.env` não exista.

## Build de Release

```bash
pnpm build
```

- Gera o binário Tauri (modo release).
- Compila o servidor de sinalização (TypeScript → JavaScript) em `apps/signaling-server/dist`.

## Testes

```bash
pnpm test
```

Executa:

- Testes de unidade em Rust (chunking, checksums, criptografia).
- Testes de unidade no servidor de sinalização (validação de mensagens com zod).

## Estrutura do Repositório

```
fluxshare/
  README.md
  package.json
  pnpm-workspace.yaml
  apps/
    client/
      package.json
      src-tauri/
        Cargo.toml
        src/
          main.rs
          commands/
            files.rs
            transfer.rs
            webrtc.rs
            quic.rs
            tunnel.rs
            settings.rs
      src/
        app/
          routes/
            Send.tsx
            Receive.tsx
            Peers.tsx
            Tunnel.tsx
            Settings.tsx
            Logs.tsx
          components/
            FilePicker.tsx
            ProgressBar.tsx
            PeerList.tsx
            SpeedMeter.tsx
          lib/
            api.ts
            webrtcClient.ts
        App.tsx
        index.tsx
      vite.config.ts
      tailwind.config.ts
      postcss.config.cjs
      tsconfig.json
      tsconfig.node.json
    signaling-server/
      package.json
      tsconfig.json
      src/index.ts
```

## Mensagens WS de Sinalização (exemplos)

```json
{ "type": "register", "id": "alice" }
{ "type": "offer", "from": "alice", "to": "bob", "sdp": "..." }
{ "type": "answer", "from": "bob", "to": "alice", "sdp": "..." }
{ "type": "ice", "from": "alice", "to": "bob", "candidate": { "candidate": "candidate:0 ..." } }
{ "type": "bye", "from": "alice", "to": "bob" }
```

## Licença

MIT
