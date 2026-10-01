# Mural OSC

Painel fixo na área de trabalho de cada colaborador. Mostra:
- **Sistemas**: atalhos para sites e programas;
- **Avisos**: normais, importantes ou urgentes;
- **Agenda**;
- **Fotos e vídeos** dos eventos.

O administrador publica tudo pelo site, e os PCs recebem em até 30 segundos.

## Como funciona

| Parte | Onde fica | O que faz |
|---|---|---|
| Página de instalação | `/` | O colaborador baixa o instalador sem precisar da senha do admin. |
| Administração | `/admin` | Publica avisos, agenda, fotos e vídeos e sistemas. Mostra os computadores com o mural ligado. |
| Mural | `/widget` | A tela que aparece nos PCs. O app carrega do site, então mudanças visuais chegam a todos sem reinstalar. |
| API | `/api/*` | Uma função da Vercel (`api/index.js` → `lib/app.js`). |
| Banco | Neon (Postgres) | Tabelas em `db/schema.sql`. |
| Arquivos | Vercel Blob | Fotos, vídeos, logos e o instalador. Vão do navegador direto para o Blob. |
| App do Windows | `desktop/` | Electron. Fixa o mural na área de trabalho, abre os atalhos, notifica urgentes e inicia com o Windows. |

**Quem pode ler o conteúdo:**
- O app instalado, que manda a chave dos PCs em todo pedido.
- Quem está logado no admin.

Sem uma das duas coisas, o site não entrega avisos nem fotos. Isso importa por causa da LGPD, já que o mural mostra fotos de colaboradores.

## Variáveis de ambiente (Vercel)

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão do Neon (criada pela integração). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (criada ao conectar o Blob). |
| `MURAL_SENHA_ADMIN` | Senha do admin. |
| `MURAL_SEGREDO` | Assina o cookie de sessão. É um texto aleatório longo. |
| `MURAL_CHAVE_PCS` | Chave que o app instalado usa. Se trocar, é preciso gerar o instalador de novo. |
| `MURAL_SITE_URL` | Endereço público do site, usado ao gerar o instalador. |

## Tarefas comuns

```powershell
npm install
vercel env pull .env.local --environment production   # não exporta valores marcados como Secret
npm run migrar        # cria as tabelas (e o conteúdo inicial, na primeira vez)
npm run dev           # site local em http://localhost:3000, usando o .env.local
```

**Publicar uma nova versão do app do Windows:** só é preciso quando algo muda em `desktop/`. Mudanças no visual do mural não exigem isso.

1. Aumente `version` em `desktop/package.json`.
2. Rode `cd desktop; npm install` e depois `cd ..; npm run instalador`.
3. O script gera `MuralOSC-Setup-<versão>.exe`, envia para o Blob e a página de instalação passa a entregar essa versão.

Variáveis marcadas como Secret são exportadas pela Vercel como `[SENSITIVE]`. Esse valor nunca pode ir para um instalador. A chave real de `MURAL_CHAVE_PCS` deve ser sincronizada entre a produção e o ambiente local. Antes de empacotar, o script verifica a autenticação no site; depois confere a configuração dentro do ASAR. Uma falha aborta a publicação. As versões anteriores do instalador são preservadas no Blob.

Para a verificação de uma versão no Windows deste escritório, defina `$env:MURAL_TESTAR_INSTALADOR='1'` antes de `npm run instalador`. O teste roda o código dentro do ASAR, confere o conteúdo autenticado, aciona Win+D quatro vezes e verifica recolher/expandir com a escala da tela. A publicação só continua se passar. Requer o perfil local do Mural já configurado; não é um teste para ambiente sem desktop. `node --test scripts/tests/configuracao.test.mjs` verifica o bloqueio de credenciais de exemplo e rejeitadas.

## Comportamento nos PCs

- Instala só para o usuário do Windows, sem pedir administrador. Inicia com o Windows (`HKCU\...\Run`).
- Na primeira vez, pergunta a unidade (São Paulo ou Assis). Dá para trocar pelo ícone da OSC na bandeja.
- Fica na lateral direita, atrás dos programas, e visível no Win+D. Não aparece na barra de tarefas nem no Alt+Tab. Não tem opção "Sair".
- **Atualização:**
  - consulta o site a cada 30 s com o mural à vista e a cada 90 s quando está coberto;
  - para com a tela bloqueada;
  - quando nada mudou, o site responde `304`, sem conteúdo.
- A galeria pausa quando o mural está coberto ou recolhido. Os vídeos tocam sem som.
- Ao iniciar e a cada minuto, o app informa ao site o nome do computador, o usuário, a unidade e a versão. Se falhar, tenta novamente após 15 segundos. O menu da bandeja mostra o estado da conexão e os erros ficam em `%AppData%\Mural OSC\mural.log`. O painel atualiza a lista a cada 30 segundos.
- RAM medida num PC com memória apertada: perto de 90 MB. Num PC folgado, a estimativa é de 150 a 250 MB. O pico é com vídeo tocando.

## Limitações conhecidas

- **O instalador não tem assinatura digital.** Na primeira execução, o Windows mostra "O Windows protegeu o computador": clique em *Mais informações* e depois em *Executar assim mesmo*. Para tirar esse aviso é preciso comprar um certificado de assinatura de código.
- **Teste local no Windows 11 (build 26200).** Falta testar no Windows 10. O mural usa `SetParent`/`WS_CHILD` para se tornar filho do host dos ícones (`Progman` ou `WorkerW`), permanecendo visível no Win+D. A identificação desses hosts do Explorer depende de implementação do Windows. Veja `desktop/fixar.js`.
- Usa só o monitor principal.
- A senha do admin é uma só, sem usuários separados.
