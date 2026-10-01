'use strict';
// Teste no Windows real: renderer autenticado, registro na API e Win+D.
const { app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const desktop = path.join(__dirname, '..');
const perfil = path.join(desktop, 'dist', 'smoke-profile');
fs.mkdirSync(perfil, { recursive: true });
fs.copyFileSync(path.join(process.env.APPDATA, 'Mural OSC', 'mural.json'), path.join(perfil, 'mural.json'));
app.setPath('userData', perfil);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let janela;
app.once('browser-window-created', (_ev, w) => { janela = w; });
// Executar também o código dentro do ASAR detecta arquivos ausentes no instalador.
const origem = process.argv.includes('--packed') ? path.join(desktop, 'dist', 'win-unpacked', 'resources', 'app.asar') : desktop;
require(path.join(origem, 'main.js'));

async function testar() {
  await app.whenReady();
  for (let i = 0; i < 40 && (!janela || janela.webContents.isLoading()); i++) await esperar(500);
  await esperar(2500);
  assert.ok(janela, 'Janela não criada');
  const pagina = await janela.webContents.executeJavaScript(`({
    app: !!window.mural,
    sistemas: document.querySelectorAll('#sistemas .sistema').length,
    avisos: document.querySelectorAll('#avisos .aviso').length,
    agenda: document.querySelectorAll('#eventos .evento').length,
    erro: document.getElementById('offline').hidden ? '' : document.getElementById('offline').textContent
  })`);
  assert.ok(pagina.app, 'Ponte preload ausente');
  assert.ok(pagina.sistemas > 0, `Conteúdo vazio: ${pagina.erro}`);
  assert.equal(pagina.erro, '');
  await janela.webContents.executeJavaScript(`document.getElementById('btn-expandir').click()`);
  await esperar(350);
  fs.writeFileSync(path.join(desktop, 'dist', 'smoke-widget.png'), (await janela.webContents.capturePage()).toPNG());
  const { estadoDaJanela } = require(path.join(origem, 'fixar.js'));
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const ponto = koffi.struct('MuralSmokePoint', { x: 'int32_t', y: 'int32_t' });
  const windowFromPoint = user32.func('WindowFromPoint', 'intptr_t', [ponto]);
  const getParent = user32.func('intptr_t __stdcall GetParent(intptr_t)');
  const getClass = user32.func('int __stdcall GetClassNameW(intptr_t, void *, int)');
  const tecla = user32.func('void __stdcall keybd_event(uint8_t, uint8_t, uint32_t, uintptr_t)');
  const winD = () => {
    tecla(0x5b, 0, 0, 0); tecla(0x44, 0, 0, 0);
    tecla(0x44, 0, 2, 0); tecla(0x5b, 0, 2, 0);
  };
  const estados = [];
  for (let i = 0; i < 4; i++) {
    winD();
    await esperar(700);
    const estado = estadoDaJanela(janela);
    assert.ok(estado.filha && estado.pai === estado.host && estado.host, 'Mural não está na árvore do desktop');
    assert.ok(estado.visivel && !estado.minimizada, 'Win+D escondeu o mural');
    let topo = Number(windowFromPoint({ x: estado.limites.x + 30, y: estado.limites.y + 150 }));
    estado.pilhas = [];
    for (let j = 0; j < 20 && topo && topo !== estado.hwnd; j++) {
      const nome = Buffer.alloc(512); getClass(topo, nome, 256);
      estado.pilhas.push({ hwnd: topo, classe: nome.toString('utf16le').replace(/\0.*$/, '') });
      topo = Number(getParent(topo));
    }
    estado.exposto = topo === estado.hwnd;
    if (estado.exposto) {
      const b = estado.limites;
      const destino = path.join(desktop, 'dist', 'smoke-desktop.png');
      execFileSync('powershell.exe', ['-NoProfile', '-Command',
        `Add-Type -AssemblyName System.Drawing; $b=New-Object System.Drawing.Bitmap(${b.width},${b.height}); $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(${b.x},${b.y},0,0,$b.Size); $b.Save('${destino}'); $g.Dispose(); $b.Dispose()`]);
    }
    estados.push(estado);
    fs.writeFileSync(path.join(desktop, 'dist', 'smoke-native.json'), JSON.stringify(estados, null, 2));
  }
  assert.ok(estados.some((s) => s.exposto), 'Mural não apareceu sobre os ícones ao mostrar o desktop');
  await janela.webContents.executeJavaScript(`document.getElementById('btn-recolher').click()`);
  await esperar(350);
  const larguraFisica = (width) => screen.dipToScreenRect(janela, { x: 0, y: 0, width, height: 100 }).width;
  assert.equal(estadoDaJanela(janela).limites.width, larguraFisica(64), 'Recolhimento não redimensionou a janela');
  await janela.webContents.executeJavaScript(`document.getElementById('btn-expandir').click()`);
  await esperar(350);
  assert.equal(estadoDaJanela(janela).limites.width, larguraFisica(360), 'Expansão não redimensionou a janela');
  const config = JSON.parse(fs.readFileSync(path.join(origem, 'config.json')));
  const negado = await fetch(config.url + '/api/dados');
  assert.equal(negado.status, 401, 'Dados liberados sem credencial');
  return { pagina, estados, acessoSemChave: negado.status };
}
testar().then((resultado) => {
  fs.writeFileSync(path.join(desktop, 'dist', 'smoke-result.json'), JSON.stringify({ ok: true, ...resultado }, null, 2));
  console.log(JSON.stringify(resultado, null, 2));
  app.exit(0);
}).catch((erro) => {
  fs.writeFileSync(path.join(desktop, 'dist', 'smoke-result.json'), JSON.stringify({ ok: false, erro: erro.stack }, null, 2));
  console.error(erro.stack);
  app.exit(1);
});
