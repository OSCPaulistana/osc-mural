'use strict';
// Cria as tabelas no banco e, na primeira vez, coloca o conteúdo inicial.
//   npm run migrar   (usa DATABASE_URL do ambiente ou do arquivo .env.local)
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
for (const arquivo of ['.env.local', '.env']) {
  if (fs.existsSync(path.join(raiz, arquivo))) { try { process.loadEnvFile(path.join(raiz, arquivo)); } catch {} }
}

const { consulta, obterPool } = require('../lib/db');

const SISTEMAS = [
  { nome: 'Onvio', descricao: 'Portal Thomson Reuters', tipo: 'site', endereco: 'https://onvio.com.br', icone: 'cloud', cor: 'petroleo', logo: '' },
  { nome: 'Paralegal', descricao: 'Hub Paralegal', tipo: 'site', endereco: 'https://hub-paralegal.vercel.app/', icone: 'briefcase', cor: 'grafite', logo: '/assets/branding/osc-simbolo.png' },
  { nome: 'Painéis', descricao: 'Central de painéis', tipo: 'site', endereco: 'https://central-paineis-mauve.vercel.app/', icone: 'layout-dashboard', cor: 'azul', logo: '' },
  { nome: 'e-CAC', descricao: 'Receita Federal', tipo: 'site', endereco: 'https://cav.receita.fazenda.gov.br/autenticacao/login', icone: 'landmark', cor: 'verde', logo: '' },
  { nome: 'eSocial', descricao: 'Portal do eSocial', tipo: 'site', endereco: 'https://login.esocial.gov.br/login.aspx', icone: 'users', cor: 'ciano', logo: '' },
  { nome: 'Outlook', descricao: 'E-mail corporativo', tipo: 'site', endereco: 'https://outlook.office.com/mail/', icone: 'mail', cor: 'azul', logo: '' },
];

// Feriados nacionais de data fixa (Lei 662/1949, Lei 6.802/1980 e Lei 14.759/2023)
const FERIADOS = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

function proximosFeriados(meses = 6) {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const limite = new Date();
  limite.setMonth(limite.getMonth() + meses);
  const fim = limite.toLocaleDateString('sv-SE');
  const ano = Number(hoje.slice(0, 4));
  return [ano, ano + 1]
    .flatMap((a) => FERIADOS.map(([md, nome]) => ({ data: `${a}-${md}`, nome })))
    .filter((f) => f.data >= hoje && f.data <= fim);
}

(async () => {
  await consulta(fs.readFileSync(path.join(raiz, 'db', 'schema.sql'), 'utf8'));
  console.log('Tabelas conferidas.');

  const [{ n }] = await consulta('select count(*)::int as n from sistemas');
  if (n === 0) {
    for (const [i, s] of SISTEMAS.entries()) {
      await consulta('insert into sistemas (nome, descricao, tipo, endereco, icone, cor, logo, ordem) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [s.nome, s.descricao, s.tipo, s.endereco, s.icone, s.cor, s.logo, i + 1]);
    }
    for (const f of proximosFeriados()) {
      await consulta("insert into eventos (titulo, data, local, unidade) values ($1, $2, 'Feriado nacional', 'todas')", [f.nome, f.data]);
    }
    await consulta(`insert into avisos (titulo, texto, prioridade, unidade, expira_em) values ($1, $2, 'info', 'todas', current_date + 14)`, [
      'Boas-vindas ao Mural OSC',
      'Aqui aparecem os avisos do escritório, a agenda e as fotos dos nossos eventos. Os atalhos acima abrem os sistemas do dia a dia.',
    ]);
    console.log('Conteúdo inicial criado: sistemas, feriados nacionais e aviso de boas-vindas.');
  } else {
    console.log('O banco já tem conteúdo; nada foi alterado.');
  }
  await obterPool().end();
})().catch((erro) => {
  console.error('Falhou:', erro.message);
  process.exit(1);
});
