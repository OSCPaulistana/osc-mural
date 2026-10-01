'use strict';
// Janela filha do host dos ícones: Win+D mantém o mural no desktop.
const GWL_STYLE = -16;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_ASYNCWINDOWPOS = 0x4000;
const SWP_SHOWWINDOW = 0x0040;
let api;

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
  };
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

function fixarNaAreaDeTrabalho(janela) {
  const w = carregarApi();
  if (!w || janela.isDestroyed()) return false;
  const host = hostDaAreaDeTrabalho(w);
  if (!host) return false;
  const hwnd = hwndDe(janela);
  if (Number(w.GetParent(hwnd)) !== host) {
    const estilo = w.GetWindowLongW(hwnd, GWL_STYLE);
    w.SetWindowLongW(hwnd, GWL_STYLE, (estilo | WS_CHILD) & ~WS_POPUP);
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
  return !!w.SetWindowPos(hwnd, 0, ponto.readInt32LE(0), ponto.readInt32LE(4), pixels.width, pixels.height,
    SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS | SWP_SHOWWINDOW);
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
