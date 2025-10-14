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
# terminal 1 – servidor de sinalização
pnpm --filter signaling-server dev

# terminal 2 – cliente web
pnpm --filter fluxshare-client dev

# opcional: cliente Tauri
pnpm --filter fluxshare-client tauri dev
```

O cabeçalho do cliente exibe um botão para alternar entre os temas claro e escuro; a escolha é persistida automaticamente no
`localStorage`.

Defina um arquivo `.env` na raiz de `apps/client` com a URL do servidor de sinalização e ICE servers:

```bash
VITE_SIGNALING_URL=ws://localhost:5174/ws
VITE_STUN_URL=stun:stun.l.google.com:19302
# TURN opcional
# VITE_TURN_URL=turn://example.com:3478
# VITE_TURN_USER=user
# VITE_TURN_PASS=pass
```

### Configuração do servidor de sinalização

O servidor expõe um endpoint WebSocket em `/ws`. As mensagens são validadas com `zod` e seguem o protocolo:

```json
// client → server
{"type":"join","room":"AB12CD","peerId":"p1","displayName":"Alice"}
{"type":"signal","room":"AB12CD","from":"p1","to":"p2","data":{...}}
{ "type":"leave","room":"AB12CD","peerId":"p1" }
{ "type":"heartbeat","peerId":"p1" }

// server → client
{"type":"peers","room":"AB12CD","peers":[{"peerId":"p2","displayName":"Bob"}]}
{"type":"peer-joined","peer":{"peerId":"p3","displayName":"Carol"}}
{"type":"peer-left","peerId":"p2"}
{"type":"signal","from":"p2","to":"p1","data":{...}}
```

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
  apps/
    client/
      src/
        App.tsx
        index.tsx
        pages/
          Home.tsx
          Room.tsx
        components/
          PeersPanel.tsx
          TransferBox.tsx
        lib/
          signaling.ts
          persist/
            indexeddb.ts
            tauri.ts
          webrtc/
            PeerManager.ts
            transfer.ts
        store/
          usePeers.ts
          useTransfers.ts
        workers/
          fileReader.worker.ts
        utils/env.ts
        types/protocol.ts
      src-tauri/
        src/commands/files.rs
        src/main.rs
    signaling-server/
      src/index.ts
```

## Licença

MIT

## Decisões principais

- Protocolo WebSocket foi refeito para suportar salas, heartbeat e broadcast de peers reais.
- O cliente React utiliza Zustand com persistência parcial (IndexedDB + BroadcastChannel) para manter seleção e progresso entre abas.
- Transferências usam WebRTC DataChannel confiável com chunking de 16 KiB, controle de backpressure e protocolo de ACK/RESUME.
- Leituras de arquivo foram delegadas para worker (web) e comando Tauri (`read_file_range`) para preservar memória.
