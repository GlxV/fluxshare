# Changelog

## [2.1.0] - 2026-03-18

### Core / UX

- Melhorada a base de UX do app para reduzir sensacao de prototipo e deixar o produto mais consistente entre Send File, P2P e Settings.
- Refinada a hierarquia visual, espacamento, estados e feedbacks para dar mais sensacao de software desktop real.
- Estruturado um sistema visual mais modular para suportar customizacao de aparencia de forma coerente.

### Importacao de arquivos

- Investigado e reduzido o gargalo que fazia a UI parecer travada ao importar arquivos grandes.
- Removido processamento pesado da etapa inicial de selecao quando possivel.
- Movida a preparacao/importacao pesada para fluxo assincrono em background.
- Adicionado feedback continuo durante a importacao:
  - estado real de carregamento
  - progresso visivel
  - mensagens claras
  - indicacao de que o app continua ativo
- Melhorados estados intermediarios e tratamento de erro no fluxo de importacao.
- Reduzida a sensacao de soft-freeze ao importar arquivos grandes.

### Tunel / compartilhamento publico

- Reestruturado o fluxo de abertura do tunel para nao considerar URL detectada como pronto.
- Adicionadas checagens mais reais de disponibilidade antes de expor o link.
- Melhorados os estados do tunel:
  - iniciando
  - aguardando disponibilidade
  - online
  - falhou
  - reconectando
- Ajustado o momento em que o link publico aparece na UI para refletir melhor a realidade.
- Removida a dependencia incorreta de probes em `/health` publico.
- Melhorado o monitoramento de readiness do `cloudflared`.
- Otimizado o startup do tunel com reducao de atrasos desnecessarios.
- Melhorado o comportamento visual e funcional para reduzir sensacao de instabilidade.

### Windows Explorer / clique direito

- Implementada a base da integracao com menu de contexto do Windows Explorer.
- Adicionado toggle em Settings para ativar/desativar a integracao.
- Implementado registro/desregistro via shell classico do Windows.
- Adicionado handoff de arquivo por argumento de linha de comando.
- Implementado fluxo para abrir/focar o app e encaminhar arquivo para a instancia ja aberta.
- Integrado o recebimento do arquivo ao pipeline automatico de importacao/share.
- Iteradas correcoes de registro, refresh do Explorer e autorreparo do estado.
- Status real desta frente: a base de integracao e o handoff foram trabalhados, mas a exibicao do item no Explorer ainda ficou pendente de validacao final no Windows.

### Pagina publica de arquivo

- Redesenhada a pagina publica para sair de mini landing page e parecer host de arquivo real.
- Reorganizado o layout para foco direto no arquivo:
  - topbar discreta
  - preview grande
  - painel lateral com metadados e acao principal
- Melhorado o card do arquivo, CTA principal e estados de disponibilidade/erro.
- Refinado o visual para reduzir vibe AI-like, SaaS mockup e excesso de ornamento.
- Feito um polish fino sem destruir a estrutura boa:
  - removido label de preview em cima do embed
  - reduzido peso visual do nome do arquivo
  - reorganizada metadata
  - removidas redundancias de tipo/extensao/formato
  - melhor integrada a area de preview ao layout
  - refinada a topbar
  - melhorado fundo/branding/acoes utilitarias

### Previews inline

- Adicionado suporte inline real para PDF.
- Adicionado suporte inline para arquivos textuais:
  - txt
  - log
  - json
  - csv
  - md
- Adicionado suporte inicial de preview para `docx`.
- Criada base extensivel de renderers por tipo de arquivo.
- Melhorado fallback para formatos sem preview inline.
- Adicionados limites e cuidados para arquivos grandes.
- Sanitizado o conteudo renderizado para evitar execucao insegura.
- Mantida consistencia visual entre tipos de preview.

### UI geral do app

- Redesenhada a base visual do FluxShare inteiro, nao so Quick Send.
- Refinado o header/top navigation para ficar mais compacto e menos dashboard cru.
- Melhorado Send File como tela principal:
  - dropzone mais forte
  - CTA mais claro
  - estados mais bonitos e legiveis
- Alinhada a tela P2P com a nova linguagem visual do app.
- Reestruturada a tela Settings para funcionar melhor como centro de personalizacao.
- Reduzida a sensacao de UI generica / mockup / glow SaaS.

### Temas e customizacao

- Estruturada uma base real de design tokens para:
  - cores
  - superficies
  - spacing
  - radius
  - sombras
  - contraste
  - densidade
  - estados visuais
- Melhorada a arquitetura de temas/personalizacao para suportar modularidade de verdade.
- Adicionados novos presets alem de Light e Dark.
- Presets trabalhados nesta release:
  - Sunset
  - Midnight
  - Vibrant
  - Graphite
  - Polar
  - Ember
  - Copper Night
  - Aurora
  - Ocean Glass
  - Frostline
  - Ashen Blue
  - Neon Dusk
  - Rosebyte
  - Velvet
  - Terminal
- Melhorada a galeria de temas em Settings para escalar com mais presets.

### Identidade visual

- Removido o uso do `FS` como pseudo-logo placeholder.
- Substituida a marca improvisada por uma identidade mais discreta e mais propria do produto.
- Trocados placeholders de branding na interface por marcas/icones mais intencionais.
- Mantida identidade mais sutil, menos forcada e menos artificial.

### Release / versao 2.1

- Atualizado o projeto para FluxShare 2.1.0 de forma consistente nos principais manifests e configs.
- Atualizado o README para posicionar o app como Windows-first.
- Mantidas notas honestas sobre Linux/macOS como caminhos experimentais, nao foco oficial da release.
- Gerada a build release estavel.
- Movido o executavel principal para a raiz do projeto como `FluxShare-2.1.0.exe`.

### Ajustes de metadata

- Alinhado versionamento entre frontend, backend Tauri, monorepo e app metadata.
- Corrigidas inconsistencias de metadata de release.
- Alinhado o metadata de licenca com o arquivo real de licenca do projeto.
