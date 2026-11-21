/* Tombola Moro – parte comune (cartelle, smorfia, archivio)
   IISS "Aldo Moro – S. Cosmai" Trani */

/* ====== CONFIGURAZIONE ======
   Incolla qui l'indirizzo dello script Google (finisce con /exec).
   Se resta vuoto, il programma funziona in "modalità prova":
   le cartelle restano salvate solo nel browser di questo computer. */
const TOMBOLA_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzkg2KEaXvPCiRh4h0tC8MIAz4VeB_Kygs9f-p0ju_4-uZhu1f64KOhlYOP8wo8suow/exec';

const SITE_BASE = 'https://liceimorotrani.github.io/tombola/';

const INDIRIZZI = {
  ITES: { nome: 'ITES', esteso: 'Licei tecnologici (ITES)', colore: '#109FAC' },
  EOA:  { nome: 'EOA', esteso: 'Enogastronomia e ospitalità alberghiera', colore: '#FDB300' },
  MODA: { nome: 'Moda', esteso: 'Moda – Made in Italy', colore: '#ED40F1' },
  AUDIO:{ nome: 'Audiovisivo', esteso: 'Audiovisivo – Spettacolo', colore: '#FE114A' }
};

/* ====== Codici cartella ======
   6 caratteri (alfabeto senza lettere ambigue): oltre 1 miliardo di cartelle diverse. */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function nuovoCodice() {
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  let s = ''; for (const x of a) s += ALFABETO[x % ALFABETO.length];
  return s;
}
function codiceValido(c) { return typeof c === 'string' && /^[2-9A-HJKMNP-Z]{6}$/.test(c); }
function semeDaCodice(c) {
  let h = 2166136261 >>> 0;
  for (const ch of c) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mescola(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

/* Cartella regolamentare: 3 righe × 9 colonne, 5 numeri per riga (15 in tutto),
   colonna 1 = 1-9, colonna 2 = 10-19 … colonna 9 = 80-90, numeri crescenti dall'alto. */
function cartellaDaCodice(codice) {
  const r = rng(semeDaCodice(codice));
  let righe;
  for (;;) {
    righe = [0, 1, 2].map(() => mescola([0,1,2,3,4,5,6,7,8], r).slice(0, 5));
    const coperte = new Set(righe.flat());
    if (coperte.size === 9) break;
  }
  const griglia = [Array(9).fill(0), Array(9).fill(0), Array(9).fill(0)];
  for (let c = 0; c < 9; c++) {
    const da = c === 0 ? 1 : c * 10, a = c === 8 ? 90 : c * 10 + 9;
    const quali = [0, 1, 2].filter(i => righe[i].includes(c));
    const pool = []; for (let n = da; n <= a; n++) pool.push(n);
    const scelti = mescola(pool, r).slice(0, quali.length).sort((x, y) => x - y);
    quali.forEach((riga, k) => { griglia[riga][c] = scelti[k]; });
  }
  return griglia; // 0 = casella vuota
}
function numeriCartella(g) { return g.flat().filter(n => n > 0); }

/* ====== Link della pagina alunno ====== */
function linkAlunno(codici, nome, cognome, classe, indirizzo) {
  const p = new URLSearchParams({ c: codici.join('.'), n: `${nome} ${cognome}`.trim(), k: `${classe} ${INDIRIZZI[indirizzo]?.nome || indirizzo}` });
  return SITE_BASE + 'cartelle.html#' + p.toString();
}

/* ====== Archivio cartelle (script Google oppure browser) ====== */
const Archivio = {
  modalitaProva: !TOMBOLA_SCRIPT_URL,
  _locale() { try { return JSON.parse(localStorage.getItem('tombola_archivio_prova') || '[]'); } catch (e) { return []; } },
  _salvaLocale(a) { try { localStorage.setItem('tombola_archivio_prova', JSON.stringify(a)); } catch (e) {} },

  async registra({ pin, nome, cognome, classe, indirizzo, quante, forza }) {
    if (this.modalitaProva) {
      const a = this._locale();
      const chiave = (x) => [x.nome, x.cognome, x.classe, x.indirizzo].join('|').toLowerCase();
      const io = { nome, cognome, classe, indirizzo };
      const gia = a.filter(x => chiave(x) === chiave(io));
      if (gia.length && !forza) return { ok: true, esistente: true, codici: gia.map(x => x.codice) };
      const usati = new Set(a.map(x => x.codice)); const codici = [];
      while (codici.length < quante) { const c = nuovoCodice(); if (!usati.has(c)) { usati.add(c); codici.push(c); } }
      const ts = new Date().toISOString();
      codici.forEach(c => a.push({ data: ts, codice: c, nome, cognome, classe, indirizzo }));
      this._salvaLocale(a);
      return { ok: true, codici };
    }
    for (let tentativo = 0; tentativo < 4; tentativo++) {
      const codici = Array.from({ length: quante }, nuovoCodice);
      const res = await fetch(TOMBOLA_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ azione: 'crea', pin, nome, cognome, classe, indirizzo, codici, forza: !!forza })
      }).then(r => r.json());
      if (res.conflitto) continue; // codice già usato: ne genero altri
      return res;
    }
    return { ok: false, errore: 'Riprova tra un attimo.' };
  },

  async elenco(pin) {
    if (this.modalitaProva) return { ok: true, cartelle: this._locale() };
    const u = TOMBOLA_SCRIPT_URL + '?azione=elenco&pin=' + encodeURIComponent(pin) + '&t=' + Date.now();
    return fetch(u).then(r => r.json());
  },

  async alunni(pin) {
    if (this.modalitaProva) return { ok: false };
    return fetch(TOMBOLA_SCRIPT_URL + '?azione=alunni&pin=' + encodeURIComponent(pin) + '&t=' + Date.now()).then(r => r.json());
  },

  async elimina(pin, codici) {
    if (this.modalitaProva) { const s = new Set(codici); const a = this._locale(); this._salvaLocale(a.filter(x => !s.has(x.codice))); return { ok: true, eliminate: a.filter(x => s.has(x.codice)).length }; }
    return fetch(TOMBOLA_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ azione: 'elimina', pin, codici }) }).then(r => r.json());
  },

  async archivia(pin) {
    if (this.modalitaProva) { const a = this._locale(); localStorage.setItem('tombola_archivio_prova_' + Date.now(), JSON.stringify(a)); this._salvaLocale([]); return { ok: true, archiviate: a.length }; }
    return fetch(TOMBOLA_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ azione: 'archivia', pin }) }).then(r => r.json());
  }
};

/* ====== La smorfia napoletana ====== */
const SMORFIA = [null,
['L\'Italia','L\'Italia','🇮🇹'],
['\'A piccerella','La bambina','👧'],
['\'A jatta','La gatta','🐈'],
['\'O puorco','Il maiale','🐖'],
['\'A mano','La mano','✋'],
['Chella che guarda \'nterra','Quella che guarda a terra','👇'],
['\'O vasetto','Il vasetto','🏺'],
['\'A Maronna','La Madonna','🙏'],
['\'A figliata','La figliolanza','👨‍👩‍👧‍👦'],
['\'E fasule','I fagioli','🥫'],
['\'E suricille','I topolini','🐭'],
['\'O surdato','Il soldato','💂'],
['Sant\'Antonio','Sant\'Antonio','🔥'],
['\'O mbriaco','L\'ubriaco','🥴'],
['\'O guaglione','Il ragazzo','🧒'],
['\'O culo','Il sedere','🍑'],
['\'A disgrazzia','La disgrazia','⚡'],
['\'O sanghe','Il sangue','🩸'],
['\'A resata','La risata','😂'],
['\'A festa','La festa','🎉'],
['\'A femmena annura','La donna nuda','🌹'],
['\'O pazzo','Il pazzo','🤪'],
['\'O scemo','Lo scemo','🤡'],
['\'E gguardie','Le guardie','👮'],
['Natale','Natale','🎄'],
['Nanninella','Annarella','👩'],
['\'O cantero','Il vaso da notte','🚽'],
['\'E zzizze','Le zizze','🍼'],
['\'O pate d\'e criature','Il padre dei bambini','👨‍👧'],
['\'E palle d\'o tenente','Le palle del tenente','🎖️'],
['\'O padrone \'e casa','Il padrone di casa','🏠'],
['\'O capitone','Il capitone','🐍'],
['L\'anne \'e Cristo','Gli anni di Cristo','✝️'],
['\'A capa','La testa','🗣️'],
['L\'aucelluzzo','L\'uccellino','🐦'],
['\'E castagnelle','Le nacchere','🥁'],
['\'O monaco','Il monaco','📿'],
['\'E mmazzate','Le botte','👊'],
['\'A funa \'nganna','La corda al collo','⛓️'],
['\'A noia','La noia','😩'],
['\'O curtiello','Il coltello','🔪'],
['\'O ccafè','Il caffè','☕'],
['\'A femmena \'ncopp\'o balcone','La donna al balcone','🌺'],
['\'E ccancelle','Il carcere','🔒'],
['\'O vino bbuono','Il vino buono','🍷'],
['\'E denare','I soldi','💰'],
['\'O muorto','Il morto','💀'],
['\'O muorto che parla','Il morto che parla','👻'],
['\'O piezzo \'e carne','Il pezzo di carne','🥩'],
['\'O ppane','Il pane','🍞'],
['\'O ciardino','Il giardino','🌳'],
['\'A mamma','La mamma','🤱'],
['\'O viecchio','Il vecchio','👴'],
['\'O cappiello','Il cappello','🎩'],
['\'A museca','La musica','🎵'],
['\'A caruta','La caduta','🤕'],
['\'O scartellato','Il gobbo (porta fortuna)','🍀'],
['\'O paccotto','Il pacco','📦'],
['\'E pile','I peli','🧔'],
['Se lamenta','Si lamenta','😢'],
['\'O cacciatore','Il cacciatore','🏹'],
['\'O muorto acciso','Il morto ammazzato','🕵️'],
['\'A sposa','La sposa','👰'],
['\'A sciammeria','La marsina','🤵'],
['\'O chianto','Il pianto','😭'],
['\'E ddoje zetelle','Le due zitelle','👭'],
['\'O totaro int\'a chitarra','Il totano nella chitarra','🦑'],
['\'A zuppa cotta','La zuppa cotta','🍲'],
['Sott\'e \'ncoppa','Sottosopra','🙃'],
['\'O palazzo','Il palazzo','🏛️'],
['L\'ommo \'e niente','L\'uomo senza valore','🤨'],
['\'A maraviglia','La meraviglia','😲'],
['\'O spitale','L\'ospedale','🏥'],
['\'A rotta','La grotta','⛰️'],
['Pullecenella','Pulcinella','🎭'],
['\'A funtana','La fontana','⛲'],
['\'E riavulille','I diavoletti','😈'],
['\'A bella figliola','La bella ragazza','💃'],
['\'O mariuolo','Il ladro','🦹'],
['\'A vocca','La bocca','👄'],
['\'E sciure','I fiori','💐'],
['\'A tavula \'mbandita','La tavola imbandita','🍽️'],
['\'O maletiempo','Il maltempo','⛈️'],
['\'A chiesa','La chiesa','⛪'],
['L\'aneme \'o priatorio','Le anime del purgatorio','🕯️'],
['\'A puteca','La bottega','🏪'],
['\'E perucchie','I pidocchi','🐜'],
['\'E casecavalle','I caciocavalli','🧀'],
['\'A vecchia','La vecchia','👵'],
['\'A paura','La paura','😱']
];

/* Immagini personalizzate della smorfia (facoltative):
   metti nella cartella tombola/smorfia/ i file 1.jpg … 90.jpg e imposta true. */
const SMORFIA_IMMAGINI = false;

/* Numeri in lettere per la voce */
function numeroInLettere(n) {
  const u = ['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove'];
  const d = ['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'];
  if (n < 20) return u[n];
  const t = Math.floor(n / 10), r = n % 10;
  let s = d[t]; if (r === 1 || r === 8) s = s.slice(0, -1);
  return r ? s + (r === 3 ? 'tré' : u[r]) : s;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
