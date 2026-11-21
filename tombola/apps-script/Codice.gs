/**
 * TOMBOLA MORO – archivio delle cartelle
 * IISS "Aldo Moro – S. Cosmai" Trani
 *
 * Questo script va incollato in un Foglio Google (Estensioni › Apps Script)
 * e pubblicato come "App web". Salva chi ha quali cartelle e le passa al tabellone.
 */

// ⬇⬇⬇ Codice operatore: scegline uno tuo (lo danno solo ai ragazzi che generano le cartelle)
const PIN = 'CAMBIAMI';
// ⬆⬆⬆

const FOGLIO = 'Cartelle';
const INTESTAZIONE = ['Data', 'Codice cartella', 'Nome', 'Cognome', 'Classe', 'Indirizzo'];

function foglio_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FOGLIO);
  if (!sh) {
    sh = ss.insertSheet(FOGLIO, 0);
    sh.appendRow(INTESTAZIONE);
    sh.getRange(1, 1, 1, INTESTAZIONE.length).setFontWeight('bold').setBackground('#002A64').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function risposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function righe_() {
  const sh = foglio_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 6).getValues().map(r => ({
    data: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    codice: String(r[1]), nome: String(r[2]), cognome: String(r[3]), classe: String(r[4]), indirizzo: String(r[5])
  }));
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.azione === 'prova') return risposta_({ ok: true, messaggio: 'Tombola Moro: script attivo' });
  if (p.pin !== PIN) return risposta_({ ok: false, errore: 'Codice operatore errato' });
  if (p.azione === 'elenco') return risposta_({ ok: true, cartelle: righe_() });
  if (p.azione === 'alunni') return risposta_({ ok: true, alunni: alunni_() });
  return risposta_({ ok: false, errore: 'Azione sconosciuta' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return risposta_({ ok: false, errore: 'Richiesta non valida' }); }
  if (d.pin !== PIN) return risposta_({ ok: false, errore: 'Codice operatore errato' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.azione === 'crea') return risposta_(crea_(d));
    if (d.azione === 'archivia') return risposta_(archivia_());
    if (d.azione === 'caricaAlunni') return risposta_(caricaAlunni_(d));
    return risposta_({ ok: false, errore: 'Azione sconosciuta' });
  } finally {
    lock.releaseLock();
  }
}

function pulisci_(s, max) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max); }

function crea_(d) {
  const nome = pulisci_(d.nome, 40), cognome = pulisci_(d.cognome, 40);
  const classe = pulisci_(d.classe, 10), indirizzo = pulisci_(d.indirizzo, 10);
  const codici = (d.codici || []).map(String);
  if (!nome || !cognome || !classe || !indirizzo) return { ok: false, errore: 'Dati mancanti' };
  if (codici.length < 1 || codici.length > 6 || !codici.every(c => /^[2-9A-HJKMNP-Z]{6}$/.test(c))) return { ok: false, errore: 'Codici non validi' };

  const esistenti = righe_();
  const chiave = x => [x.nome, x.cognome, x.classe, x.indirizzo].join('|').toLowerCase();
  const io = chiave({ nome, cognome, classe, indirizzo });
  const suoi = esistenti.filter(x => chiave(x) === io);
  if (suoi.length && !d.forza) return { ok: true, esistente: true, codici: suoi.map(x => x.codice) };

  const usati = new Set(esistenti.map(x => x.codice));
  if (codici.some(c => usati.has(c)) || new Set(codici).size !== codici.length) return { ok: false, conflitto: true };

  const ora = new Date();
  const sh = foglio_();
  sh.getRange(sh.getLastRow() + 1, 1, codici.length, 6)
    .setValues(codici.map(c => [ora, c, nome, cognome, classe, indirizzo]));
  return { ok: true, codici: codici };
}

// Sposta tutte le cartelle in un foglio d'archivio con la data (per una nuova tombola)
function archivia_() {
  const sh = foglio_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return { ok: true, archiviate: 0 };
  const nome = 'Archivio ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd HH.mm');
  sh.copyTo(SpreadsheetApp.getActiveSpreadsheet()).setName(nome);
  sh.getRange(2, 1, n, 6).clearContent();
  return { ok: true, archiviate: n };
}

// ===== Elenco alunni (dal registro) per il menu a tendina del generatore =====
const FOGLIO_ALUNNI = 'Alunni';
function foglioAlunni_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(FOGLIO_ALUNNI);
  if (!sh) {
    sh = ss.insertSheet(FOGLIO_ALUNNI);
    sh.appendRow(['Classe', 'Sezione', 'Indirizzo', 'Cognome', 'Nome']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#002A64').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function alunni_() {
  const sh = foglioAlunni_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 5).getValues().map(r => r.map(String));
}
function caricaAlunni_(d) {
  const righe = (d.righe || []).filter(r => Array.isArray(r) && r.length === 5).map(r => r.map(x => pulisci_(x, 60)));
  const sh = foglioAlunni_();
  if (d.svuota) { const n = sh.getLastRow() - 1; if (n > 0) sh.getRange(2, 1, n, 5).clearContent(); }
  if (righe.length) sh.getRange(sh.getLastRow() + 1, 1, righe.length, 5).setValues(righe);
  return { ok: true, caricati: righe.length };
}
