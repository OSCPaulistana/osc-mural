'use strict';
// Prende a janela do mural na camada da área de trabalho do Windows (10 e 11).
//
// Truque usado por widgets de desktop: tornar a janela "dona" do Progman (a janela da área de
// trabalho). Assim ela fica sempre logo acima do papel de parede e dos ícones, abaixo de qualquer
// programa aberto, e continua visível quando o usuário aperta Win+D ("Mostrar área de trabalho").
// Não é uma API oficial; por isso tudo aqui falha em silêncio e a janela segue como janela comum.

const GWLP_HWNDPARENT = -8;
const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
// A janela dona (Progman) é do Explorer. Sem este flag, o SetWindowPos pode esperar pela thread
// do Explorer e congelar o processo principal do app.
const SWP_ASYNCWINDOWPOS = 0x4000;

let api;

function carregarApi() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    api = {
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const char16_t *classe, const char16_t *titulo)'),
      SetWindowLongPtrW: user32.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t hwnd, int indice, intptr_t valor)'),
      SetWindowPos: user32.func('int __stdcall SetWindowPos(intptr_t hwnd, intptr_t depoisDe, int x, int y, int cx, int cy, uint32_t flags)'),
    };
  } catch (erro) {
    console.warn('[mural] não foi possível carregar a user32 (koffi):', erro.message);
  }
  return api;
}

function hwndDe(janela) {
  const buf = janela.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function fixarNaAreaDeTrabalho(janela) {
  const w = carregarApi();
  if (!w) return false;
  const progman = Number(w.FindWindowW('Progman', null));
  if (!progman) return false;
  w.SetWindowLongPtrW(hwndDe(janela), GWLP_HWNDPARENT, progman);
  mandarParaTras(janela);
  return true;
}

function mandarParaTras(janela) {
  const w = carregarApi();
  if (!w) return;
  w.SetWindowPos(hwndDe(janela), HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
}

module.exports = { fixarNaAreaDeTrabalho, mandarParaTras };
