# Lead Protocol Console

Interface web local para visualizar o estado operacional do Lead Protocol. A aplicação lê os arquivos reais da pasta `.agents`, interpreta handoffs, sessões e decisões, e apresenta essas informações em um dashboard responsivo.

## Tecnologias

- React e TypeScript para a interface.
- Vite para desenvolvimento e build.
- Tailwind CSS e CSS próprio para estilos responsivos.
- Lucide React para os ícones.
- Node.js para a API e o servidor de produção.

A solução não usa PHP nem frameworks adicionais no backend. A API utiliza apenas módulos nativos do Node.js.

## Funcionalidades

- Dashboard com métricas calculadas a partir do estado operacional atual.
- Navegação dos cartões de métricas para as respectivas telas de detalhes.
- Listagem de agentes e sessões ativas.
- Visualização do handoff original e de seu resumo interpretado.
- Linha do tempo de decisões com busca por texto e filtros de agente e status.
- Exibição da precedência das regras e dos módulos ativos.
- Verificação dos arquivos obrigatórios e apresentação de erros de integridade.
- Detecção de tópicos concorrentes entre sessões ativas.
- Atualização manual dos dados sem recarregar a página.

O produto é intencionalmente somente leitura. Todos os controles exibidos executam consultas, filtros, navegação ou atualização; a interface não apresenta ações de gravação simuladas.

## Arquitetura

```text
Navegador
   |
   | GET /api/protocol
   v
Node.js / middleware do Vite
   |
   | leitura somente
   v
../.agents
   |- local/*/*/handoff.md
   |- sessions/active_sessions.md
   |- decisions.jsonl
   `- arquivos e schemas obrigatórios
```

O mesmo código de leitura é usado nos dois modos:

- Em desenvolvimento, `vite.live.config.ts` registra `/api/protocol` como middleware do Vite.
- Em produção, `server.mjs` publica a interface compilada e o endpoint `/api/protocol`.
- A lógica compartilhada está em `api/protocol.mjs`.

Isso evita diferenças de comportamento entre desenvolvimento e produção.

## Pré-requisitos

- Node.js 22 ou superior.
- npm.
- Repositório com a pasta `.agents` localizada ao lado da pasta `ui`.

Estrutura esperada:

```text
lead-protocol/
|- .agents/
`- ui/
```

## Instalação

Na pasta `ui`, execute:

```bash
npm install
```

## Desenvolvimento

Inicie o Vite:

```bash
npm run dev
```

Abra:

```text
http://localhost:5173/live-index.html
```

O middleware do Vite atende a API no mesmo endereço e porta da interface.

## Produção local

Compile a aplicação:

```bash
npm run build
```

Inicie o servidor Node.js:

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

Para usar outra porta:

```powershell
$env:PORT=8080
npm start
```

O comando `npm run preview` também inicia o mesmo servidor de produção.

## Endpoint da API

### `GET /api/protocol`

Retorna um objeto JSON consolidado com:

- métricas de sessões, decisões, integridade e conflitos;
- sessões ativas;
- agentes e handoffs encontrados;
- decisões registradas em JSONL;
- situação dos arquivos obrigatórios;
- módulos ativos;
- resultado básico da validação estrutural.

Exemplo reduzido:

```json
{
  "generatedAt": "2026-06-22T14:12:00.000Z",
  "root": ".agents",
  "metrics": {
    "activeSessions": 0,
    "todayDecisions": 1,
    "protocolPercent": 100,
    "alerts": 0
  },
  "protocolValid": true
}
```

A resposta usa `Cache-Control: no-store` para evitar a exibição de estado operacional desatualizado.

## Como os dados são interpretados

`api/protocol.mjs` executa as seguintes operações:

1. Confirma que a pasta `.agents` existe.
2. Verifica os arquivos obrigatórios definidos pela interface.
3. Lê cada linha válida de `decisions.jsonl` como JSON.
4. Localiza recursivamente os arquivos `local/*/*/handoff.md`.
5. Extrai os campos Markdown do handoff.
6. Interpreta a tabela de `sessions/active_sessions.md`.
7. Detecta sessões com o mesmo tópico como possíveis conflitos.
8. Consolida tudo no contrato JSON consumido pelo React.

Linhas JSONL inválidas são ignoradas para que uma entrada isolada não derrube todo o dashboard. Arquivos obrigatórios ausentes aparecem como erro de validação.

## Estrutura principal

```text
ui/
|- api/
|  `- protocol.mjs       # Leitura e transformação dos dados
|- src/
|  |- LiveApp.tsx        # Interface conectada à API
|  |- live-main.tsx      # Entrada React
|  `- live-styles.css    # Estilos da interface
|- server.mjs            # API e arquivos estáticos em produção
|- vite.live.config.ts   # Build e API no desenvolvimento
|- live-index.html       # HTML gerado para produção
`- package.json          # Comandos e dependências
```

## Segurança e limitações

- A API é somente leitura e não altera arquivos em `.agents`.
- O navegador não acessa o sistema de arquivos diretamente; a leitura ocorre no Node.js.
- O servidor bloqueia caminhos estáticos que tentem sair da pasta `ui`.
- Não há autenticação. Use o console localmente ou adicione autenticação antes de expô-lo em uma rede.
- Operações de escrita, como criar handoffs ou registrar sessões, não estão implementadas.

## Apache e XAMPP

O Apache pode servir apenas os arquivos estáticos compilados, mas não executa a API Node.js. Para a solução completa, use `npm start`.

Se o acesso precisar continuar pelo Apache, configure um proxy reverso de `/api/protocol` para o processo Node.js. Abrir somente `live-index.html` pelo Apache fará a interface procurar uma API que o Apache não fornece.

## Solução de problemas

### `Diretório .agents não encontrado`

Confirme que `.agents` e `ui` são pastas irmãs dentro do mesmo repositório.

### A interface abre, mas os dados não carregam

Confirme que a página está sendo acessada pelo servidor Node.js ou pelo Vite, e não diretamente pelo arquivo HTML.

Teste a API:

```text
http://localhost:3000/api/protocol
```

### Porta ocupada

Defina outra porta pela variável `PORT` antes de executar `npm start`.

### Build

Para verificar TypeScript e gerar os arquivos de produção:

```bash
npm run build
```
