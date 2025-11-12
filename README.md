# FluxShare

FluxShare é um cliente desktop multiplataforma (Windows/Linux/macOS) para transferência de arquivos **via Cloudflare Tunnel (HTTP/3/QUIC) como caminho principal**, eliminando problemas de NAT/CGNAT.  
Quando os peers estão na **mesma rede**, o app usa **WebRTC P2P** como otimização de latência. Se P2P não for possível, o **túnel** assume automaticamente.  
Licença **MIT**. Monorepo com **pnpm**.

## Pré-requisitos

- [Node.js 20+](https://nodejs.org/) com pnpm (`corepack enable`)
- [Rust](https://www.rust-lang.org/) *stable* (via rustup)
- Dependências do **Tauri v2** (ver [documentação oficial](https://tauri.app/v2/guides/getting-started/prerequisites))
- `cloudflared` disponível no `PATH`

### Dicas rápidas de instalação do `cloudflared`
- **Windows**: `winget install Cloudflare.cloudflared` (ou `choco install cloudflared`)
- **macOS**: `brew install cloudflare/cloudflare/cloudflared`
- **Linux**: use o gerenciador da sua distro ou o binário oficial; confirme com `cloudflared --version`.

### Linux/WSL build deps

Para compilar o cliente Tauri em distribuições Linux (incluindo WSL2):

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y   build-essential pkg-config libglib2.0-dev libgtk-3-dev   libwebkit2gtk-4.1-dev libsoup-3.0-dev

# Arch Linux
sudo pacman -S --needed base-devel pkgconf glib2 gtk3 webkit2gtk-4.1 libsoup3

# Fedora
sudo dnf install -y gcc-c++ make pkgconfig glib2-devel gtk3-devel   webkit2gtk4.1-devel libsoup3-devel
```

> **Nota WSL**: para empacotar apps desktop no Windows, prefira build nativo no Windows. WSL é útil para dev do servidor.

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

# opcional: cliente Tauri (desktop)
pnpm --filter fluxshare-client tauri dev
```

O cabeçalho do cliente tem alternância de tema claro/escuro com persistência em `localStorage`.

Crie um arquivo `.env` em `apps/client`:

```bash
# Dev (WebSocket)
VITE_SIGNALING_URL=ws://localhost:5174/ws

# ICE servers para P2P na mesma LAN
VITE_STUN_URL=stun:stun.l.google.com:19302
# TURN opcional
# VITE_TURN_URL=turn://example.com:3478
# VITE_TURN_USER=user
# VITE_TURN_PASS=pass

# Em produção, prefira WSS:
# VITE_SIGNALING_URL=wss://seu-dominio/ws
```

> **Cloudflared no PATH**: o app inicia/para o processo quando necessário. Se aparecer erro “`cloudflared` não está no PATH”, instale-o ou ajuste a variável de ambiente.

### Configuração do servidor de sinalização

O servidor expõe **WebSocket** em `/ws`. Mensagens validadas com `zod`:

```jsonc
// client → server
{"type":"join","room":"AB12CD","peerId":"p1","displayName":"Alice"}
{"type":"signal","room":"AB12CD","from":"p1","to":"p2","data":{...}}
{"type":"leave","room":"AB12CD","peerId":"p1"}
{"type":"heartbeat","peerId":"p1"}

// server → client
{"type":"peers","room":"AB12CD","peers":[{"peerId":"p2","displayName":"Bob"}]}
{"type":"peer-joined","peer":{"peerId":"p3","displayName":"Carol"}}
{"type":"peer-left","peerId":"p2"}
{"type":"signal","from":"p2","to":"p1","data":{...}}
```

> **Heartbeat**: enviado periodicamente (ex.: a cada 15s). O servidor remove peers inativos após *timeout* configurado.

## Como usar

1. Abra o app e crie/entre em uma **sala** (código curto).
2. Compartilhe o código com quem vai receber.
3. Arraste/solte arquivos; o app escolhe o melhor caminho (Tunnel por padrão, P2P na LAN).

## Build de Release

```bash
# Desktop (Tauri, modo release)
pnpm --filter fluxshare-client tauri build

# Servidor de sinalização (TypeScript → dist/)
pnpm --filter signaling-server build
# (ou) tsc -p apps/signaling-server
```

> Se você preferir um atalho, pode ter um `pnpm build` na raiz que orquestra ambos, mas os comandos acima são os canônicos.

## Testes

```bash
pnpm test
```

Executa:
- Testes de unidade em **Rust** (chunking, checksums, criptografia).
- Testes de unidade no **signaling** (validação com `zod`).

## Estrutura do Repositório

```
fluxshare/
  apps/
    client/                 # package name: "fluxshare-client"
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

## Decisões principais

- **Caminho principal**: Cloudflare Tunnel (HTTP/3/QUIC). **P2P/WebRTC na LAN** como otimização.
- Protocolo de sinalização via **WebSocket** com salas, heartbeat e eventos de presença.
- Cliente React usa **Zustand** com persistência parcial (**IndexedDB + BroadcastChannel**) para manter seleção/progresso entre abas.
- Transferências via **WebRTC DataChannel confiável** com chunking de **16 KiB**, backpressure e protocolo de **ACK/RESUME**.
- Leitura de arquivos em **Worker (web)** e comando **Tauri** (`read_file_range`) para reduzir uso de memória.

## Licença

MIT
