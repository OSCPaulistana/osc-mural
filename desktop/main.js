'use strict';
// App do Mural OSC para Windows.
// O visual vem do site (carregado a cada início), então mudanças no mural chegam a todos
// os PCs sem reinstalar. O app só cuida do que o site não consegue fazer sozinho:
// fixar a janela na área de trabalho, abrir programas, notificar e iniciar com o Windows.
//
// Desenvolvimento:  MURAL_URL=http://localhost:3000 MURAL_CHAVE=... npx electron .

const { app, BrowserWindow, screen, shell, ipcMain, Tray, Menu, nativeImage, Notification, dialog, session, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { posicionarNaAreaDeTrabalho } = require('./fixar');

const LARGURA = 360;
const LARGURA_RECOLHIDA = 64;
const MARGEM = 12;
const PRESENCA_MS = 60_000;
const RETENTATIVA_MS = 15_000;
const ICONE = path.join(__dirname, 'recursos', 'bandeja.png');
const UNIDADES = [['sao-paulo', 'São Paulo'], ['assis', 'Assis']];

function lerJson(arquivo) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

// Endereço do site e chave dos PCs: gravados no instalador (config.json), ou por variável de ambiente.
const EMBUTIDO = lerJson(path.join(__dirname, 'config.json')) || {};
const URL_BASE = String(process.env.MURAL_URL || EMBUTIDO.url || '').replace(/\/$/, '');
const CHAVE = String(process.env.MURAL_CHAVE || EMBUTIDO.chave || '');

let janela = null;
let bandeja = null;
let recolhido = false;
let alturaRecolhida = 0;
let energiaAtiva = true;
let local = null; // { id, unidade } salvo no perfil do usuário
let timerPresenca;
let enviandoPresenca = false;
let conectado = false;
let erroConexao = '';

function registrarErro(contexto, erro) {
  console.warn(`[mural] ${contexto}: ${erro.message}`);
  try {
    const arquivo = path.join(app.getPath('userData'), 'mural.log');
    if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > 512_000) fs.writeFileSync(arquivo, '');
    fs.appendFileSync(arquivo, `${new Date().toISOString()} ${contexto}: ${erro.message}\n`);
  } catch {}
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => janela?.reload());
  app.whenReady().then(iniciar).catch((erro) => {
    dialog.showErrorBox('Mural OSC', `Não foi possível iniciar o mural.\n\n${erro.message}`);
    app.quit();
  });
}

// ---------- Configuração deste PC ----------

function arquivoLocal() {
  return path.join(app.getPath('userData'), 'mural.json');
}

function salvarLocal() {
  fs.mkdirSync(path.dirname(arquivoLocal()), { recursive: true });
  fs.writeFileSync(arquivoLocal(), JSON.stringify(local, null, 2));
}

async function prepararLocal() {
  local = lerJson(arquivoLocal()) || {};
  if (!local.id) local.id = crypto.randomUUID();
  if (!local.unidade) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Mural OSC',
      message: 'De qual unidade é este computador?',
      detail: 'O mural mostra os avisos dessa unidade e os avisos gerais. Dá para trocar depois pelo ícone da OSC, perto do relógio.',
      buttons: UNIDADES.map(([, nome]) => nome),
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    local.unidade = UNIDADES[response]?.[0] || 'sao-paulo';
  }
  salvarLocal();
}

// ---------- Janela ----------

function limites() {
  const area = screen.getPrimaryDisplay().workArea;
  const largura = recolhido ? LARGURA_RECOLHIDA : LARGURA;
  const alturaMax = area.height - MARGEM * 2;
  const altura = recolhido && alturaRecolhida ? Math.min(alturaRecolhida, alturaMax) : alturaMax;
  return { x: area.x + area.width - largura - MARGEM, y: area.y + MARGEM, width: largura, height: altura };
}

function reposicionar() {
  if (!janela || janela.isDestroyed()) return;
  try {
    if (!posicionarNaAreaDeTrabalho(janela, limites())) throw new Error('O Explorer ainda não disponibilizou a área de trabalho.');
  } catch (erro) { registrarErro('área de trabalho', erro); }
}

function enderecoDoMural() {
  return `${URL_BASE}/widget?${new URLSearchParams({ app: '1', unidade: local.unidade })}`;
}

async function iniciar() {
  if (!URL_BASE || CHAVE.length < 12 || CHAVE === '[SENSITIVE]') throw new Error('Instalador sem configuração válida. Baixe o instalador atualizado no site do Mural OSC.');
  app.setAppUserModelId('br.com.oscpaulistana.mural');
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
  await prepararLocal();

  // Todo pedido ao site leva a chave dos PCs; sem ela o site não entrega o conteúdo do mural.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${URL_BASE}/*`] }, (detalhes, responder) => {
    detalhes.requestHeaders['X-Mural-Chave'] = CHAVE;
    responder({ requestHeaders: detalhes.requestHeaders });
  });

  janela = new BrowserWindow({
    ...limites(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // clicar no mural não o traz para frente dos programas
    type: 'toolbar', // fora do Alt+Tab
    show: false,
    title: 'Mural OSC',
    icon: ICONE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // O mural só navega dentro do próprio site; links externos vão para o navegador.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith(`${URL_BASE}/`)) ev.preventDefault();
  });

  // Ao ligar o PC a rede às vezes ainda não está pronta: tenta de novo até conseguir.
  janela.webContents.on('did-fail-load', (_ev, codigo, _descricao, _url, principal) => {
    if (principal && codigo !== -3) setTimeout(() => janela?.loadURL(enderecoDoMural()), 15_000);
  });

  janela.once('ready-to-show', () => {
    janela.showInactive();
    reposicionar();
  });
  janela.on('focus', reposicionar);
  // Reanexa se o Explorer trocar o host e recupera posição/visibilidade.
  const timerDesktop = setInterval(reposicionar, 5000);
  janela.once('closed', () => clearInterval(timerDesktop));

  janela.loadURL(enderecoDoMural());

  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, reposicionar);

  // Com a tela bloqueada ou o PC suspenso, o mural para de consultar o site.
  const mudarEnergia = (ativo) => {
    energiaAtiva = ativo;
    clearTimeout(timerPresenca);
    janela?.webContents.send('mural:energia', ativo);
    if (ativo) avisarPresenca();
  };
  powerMonitor.on('lock-screen', () => mudarEnergia(false));
  powerMonitor.on('suspend', () => mudarEnergia(false));
  powerMonitor.on('unlock-screen', () => mudarEnergia(true));
  powerMonitor.on('resume', () => mudarEnergia(true));

  criarBandeja();
  avisarPresenca();
}

function criarBandeja() {
  if (!bandeja) {
    bandeja = new Tray(nativeImage.createFromPath(ICONE).resize({ width: 16, height: 16 }));
    bandeja.setToolTip('Mural OSC');
  }
  const itens = [
    { label: `Mural OSC ${app.getVersion()}`, enabled: false },
    { label: conectado ? 'Conectado ao escritório' : (erroConexao || 'Conectando ao escritório…'), enabled: false },
    { type: 'separator' },
    {
      label: 'Unidade deste computador',
      submenu: UNIDADES.map(([id, nome]) => ({
        label: nome,
        type: 'radio',
        checked: local.unidade === id,
        click: () => {
          local.unidade = id;
          salvarLocal();
          janela?.loadURL(enderecoDoMural());
          avisarPresenca();
          criarBandeja();
        },
      })),
    },
    { label: 'Recarregar o mural', click: () => janela?.loadURL(enderecoDoMural()) },
  ];
  // O mural é obrigatório: só em desenvolvimento aparece a opção de fechar.
  if (!app.isPackaged) itens.push({ type: 'separator' }, { label: 'Sair (desenvolvimento)', click: () => app.quit() });
  bandeja.setContextMenu(Menu.buildFromTemplate(itens));
}

/** Avisa o site que este PC está com o mural ligado (aparece na tela "Computadores" do admin). */
async function avisarPresenca() {
  clearTimeout(timerPresenca);
  if (!energiaAtiva || !local || enviandoPresenca) return;
  enviandoPresenca = true;
  try {
    const resposta = await fetch(`${URL_BASE}/api/presenca`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mural-Chave': CHAVE },
      body: JSON.stringify({
        id: local.id,
        computador: os.hostname(),
        usuario: os.userInfo().username,
        unidade: local.unidade,
        versao: app.getVersion(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) throw new Error(resposta.status === 401
      ? 'Instalação não autorizada. Baixe a versão atualizada.' : `Servidor indisponível (${resposta.status}).`);
    conectado = true;
    erroConexao = '';
  } catch (erro) {
    conectado = false;
    erroConexao = erro.message;
    registrarErro('conexão', erro);
  } finally {
    enviandoPresenca = false;
    bandeja?.setToolTip(conectado ? 'Mural OSC — conectado' : 'Mural OSC — sem conexão');
    if (bandeja) criarBandeja();
    if (energiaAtiva) timerPresenca = setTimeout(avisarPresenca, conectado ? PRESENCA_MS : RETENTATIVA_MS);
  }
}

// ---------- Pedidos do widget ----------

ipcMain.handle('mural:abrir', async (_ev, id) => {
  // Busca o sistema na lista do site: o widget não escolhe o que será executado.
  let sistema;
  try {
    const r = await fetch(`${URL_BASE}/api/dados`, { headers: { 'X-Mural-Chave': CHAVE }, signal: AbortSignal.timeout(15_000) });
    sistema = (await r.json()).sistemas.find((s) => s.id === id);
  } catch {
    return { ok: false, erro: 'Sem conexão com o site do mural.' };
  }
  if (!sistema) return { ok: false, erro: 'Este atalho não existe mais.' };

  if (sistema.tipo === 'site') {
    const url = new URL(sistema.endereco);
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, erro: 'Endereço inválido.' };
    await shell.openExternal(url.href);
    return { ok: true };
  }

  if (!/^[a-zA-Z]:\\.+\.(exe|lnk)$/i.test(sistema.endereco) || !fs.existsSync(sistema.endereco)) {
    return { ok: false, erro: `${sistema.nome} não está instalado neste computador. Fale com o TI.` };
  }
  const erro = await shell.openPath(sistema.endereco);
  return erro ? { ok: false, erro: `Não foi possível abrir ${sistema.nome}.` } : { ok: true };
});

ipcMain.handle('mural:recolher', (_ev, valor, altura) => {
  recolhido = valor === true;
  alturaRecolhida = recolhido ? Math.max(0, Math.round(altura)) : 0;
  reposicionar();
});

ipcMain.handle('mural:notificar', (_ev, titulo, texto) => {
  if (Notification.isSupported()) new Notification({ title: `Aviso urgente: ${titulo}`, body: texto, icon: ICONE }).show();
});

app.on('window-all-closed', () => app.quit());
