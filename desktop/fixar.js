'use strict';
// Janela filha do host dos ícones: Win+D mantém o mural no desktop.
const GWL_STYLE = -16;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
// Bordas que o Electron mantém em janelas sem moldura (para redimensionar e encaixar).
// Numa janela filha da área de trabalho elas viram uma faixa preta em volta do mural.
const WS_BORDAS = 0x00040000 /* THICKFRAME */ | 0x00C00000 /* CAPTION */ | 0x00080000 /* SYSMENU */
  | 0x00020000 /* MINIMIZEBOX */ | 0x00010000 /* MAXIMIZEBOX */;
const GWL_EXSTYLE = -20;
const WS_EX_BORDAS = 0x00000001 /* DLGMODALFRAME */ | 0x00000100 /* WINDOWEDGE */ | 0x00000200 /* CLIENTEDGE */ | 0x00020000 /* STATICEDGE */;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_ASYNCWINDOWPOS = 0x4000;
const SWP_SHOWWINDOW = 0x0040;
const RAIO_DIP = 12;
let api;
let ultimoRecorte = '';

function carregarApi() {
  if (api !== undefined) return api;
  if (process.platform !== 'win32') return (api = null);
  const user32 = require('koffi').load('user32.dll');
  api = {
    FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const char16_t *, const char16_t *)'),
    FindWindowExW: user32.func('intptr_t __stdcall FindWindowExW(intptr_t, intptr_t, const char16_t *, const char16_t *)'),
    GetParent: user32.func('intptr_t __stdcall GetParent(intptr_t)'),
    SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t, intptr_t)'),
    GetWindowLongW: user32.func('int32_t __stdcall GetWindowLongW(intptr_t, int)'),
    SetWindowLongW: user32.func('int32_t __stdcall SetWindowLongW(intptr_t, int, int32_t)'),
    SetWindowPos: user32.func('int __stdcall SetWindowPos(intptr_t, intptr_t, int, int, int, int, uint32_t)'),
    MapWindowPoints: user32.func('int __stdcall MapWindowPoints(intptr_t, intptr_t, void *, uint32_t)'),
    IsWindowVisible: user32.func('int __stdcall IsWindowVisible(intptr_t)'),
    IsIconic: user32.func('int __stdcall IsIconic(intptr_t)'),
    GetWindowRect: user32.func('int __stdcall GetWindowRect(intptr_t, void *)'),
    SetWindowRgn: user32.func('int __stdcall SetWindowRgn(intptr_t, intptr_t, int)'),
  };
  // Janela filha da área de trabalho não aceita transparência: os cantos arredondados
  // são recortados com uma região do Windows (sem isso, aparecem cantos pretos).
  const gdi32 = require('koffi').load('gdi32.dll');
  api.CreateRoundRectRgn = gdi32.func('intptr_t __stdcall CreateRoundRectRgn(int, int, int, int, int, int)');
  return api;
}

function hwndDe(janela) {
  const buf = janela.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE()) : buf.readUInt32LE();
}

function hostDaAreaDeTrabalho(w) {
  const progman = Number(w.FindWindowW('Progman', null));
  if (progman && w.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) return progman;
  // Em outras versões do Explorer, os ícones ficam em WorkerW.
  let worker = 0;
  while ((worker = Number(w.FindWindowExW(0, worker, 'WorkerW', null)))) {
    if (w.FindWindowExW(worker, 0, 'SHELLDLL_DefView', null)) return worker;
  }
  return 0;
}

/** Sem bordas não-cliente, a área desenhada pelo Chromium ocupa a janela inteira. */
function tirarBordas(w, hwnd) {
  const estilo = w.GetWindowLongW(hwnd, GWL_STYLE);
  if (estilo & WS_BORDAS) w.SetWindowLongW(hwnd, GWL_STYLE, estilo & ~WS_BORDAS);
  const extra = w.GetWindowLongW(hwnd, GWL_EXSTYLE);
  if (extra & WS_EX_BORDAS) w.SetWindowLongW(hwnd, GWL_EXSTYLE, extra & ~WS_EX_BORDAS);
}

function fixarNaAreaDeTrabalho(janela) {
  const w = carregarApi();
  if (!w || janela.isDestroyed()) return false;
  const host = hostDaAreaDeTrabalho(w);
  if (!host) return false;
  const hwnd = hwndDe(janela);
  tirarBordas(w, hwnd);
  if (Number(w.GetParent(hwnd)) !== host) {
    const estilo = w.GetWindowLongW(hwnd, GWL_STYLE);
    w.SetWindowLongW(hwnd, GWL_STYLE, (estilo | WS_CHILD) & ~WS_POPUP & ~WS_BORDAS);
    w.SetParent(hwnd, host);
    if (Number(w.GetParent(hwnd)) !== host) {
      w.SetWindowLongW(hwnd, GWL_STYLE, estilo);
      throw new Error('O Windows não permitiu fixar o mural na área de trabalho.');
    }
  }
  return true;
}

function posicionarNaAreaDeTrabalho(janela, limites) {
  if (!fixarNaAreaDeTrabalho(janela)) return false;
  const w = carregarApi();
  const hwnd = hwndDe(janela);
  const host = Number(w.GetParent(hwnd));
  const pixels = require('electron').screen.dipToScreenRect(janela, limites);
  const ponto = Buffer.alloc(8);
  ponto.writeInt32LE(pixels.x, 0);
  ponto.writeInt32LE(pixels.y, 4);
  w.MapWindowPoints(0, host, ponto, 1);
  // HWND_TOP entre filhos do desktop, nunca acima dos programas abertos.
  const ok = !!w.SetWindowPos(hwnd, 0, ponto.readInt32LE(0), ponto.readInt32LE(4), pixels.width, pixels.height,
    SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS | SWP_SHOWWINDOW);
  recortarCantos(hwnd, pixels.width, pixels.height, pixels.width / limites.width);
  return ok;
}

/** Arredonda os cantos da janela. Só refaz quando o tamanho muda (o Windows fica com a região). */
function recortarCantos(hwnd, largura, altura, escala) {
  const w = carregarApi();
  const chave = `${hwnd}:${largura}x${altura}`;
  if (!w || chave === ultimoRecorte) return;
  const diametro = Math.round(RAIO_DIP * 2 * (escala || 1));
  const regiao = w.CreateRoundRectRgn(0, 0, largura + 1, altura + 1, diametro, diametro);
  if (regiao && w.SetWindowRgn(hwnd, regiao, 1)) ultimoRecorte = chave;
}

function estadoDaJanela(janela) {
  const w = carregarApi();
  const hwnd = hwndDe(janela);
  const retangulo = Buffer.alloc(16);
  w.GetWindowRect(hwnd, retangulo);
  const pai = Number(w.GetParent(hwnd));
  return {
    hwnd, pai, host: hostDaAreaDeTrabalho(w),
    filha: !!(w.GetWindowLongW(hwnd, GWL_STYLE) & WS_CHILD),
    visivel: !!w.IsWindowVisible(hwnd), minimizada: !!w.IsIconic(hwnd),
    limites: { x: retangulo.readInt32LE(0), y: retangulo.readInt32LE(4),
      width: retangulo.readInt32LE(8) - retangulo.readInt32LE(0), height: retangulo.readInt32LE(12) - retangulo.readInt32LE(4) },
  };
}

module.exports = { fixarNaAreaDeTrabalho, posicionarNaAreaDeTrabalho, estadoDaJanela };
