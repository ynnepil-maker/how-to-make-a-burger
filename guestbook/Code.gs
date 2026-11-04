/**
 * How to make a burger — 留言板後端（Google Apps Script）
 *
 * 用法：在 Google 試算表選「擴充功能 → Apps Script」，把這份程式貼進去，
 * 再「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人」。
 * 部署後會得到一個網址，填進 content.js 的 SITE.guestbookUrl。
 *
 * 只保存三欄：時間、暱稱、留言。不記錄 IP、不使用 Cookie。
 * 想刪掉不當留言，直接在試算表刪那一列即可。
 */
var SHEET_NAME = '留言';
var MAX_NICK = 20;
var MAX_MSG = 100;
var SHOW_LAST = 50;
var MIN_GAP_MS = 3000;   // 全站兩則留言之間至少間隔 3 秒，擋掉連發

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['時間', '暱稱', '留言']);
    sh.getRange('A:C').setNumberFormat('@');   // 一律當純文字，避免 =開頭的內容被當成公式
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  var chars = Array.from(s);
  if (chars.length > max) chars = chars.slice(0, max);
  s = chars.join('');
  if (/^[=+\-@]/.test(s)) s = '​' + s;   // 保險：不讓開頭是公式符號
  return s;
}

function doGet() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  var items = [];
  if (last > 1) {
    var n = Math.min(SHOW_LAST, last - 1);
    var rows = sh.getRange(last - n + 1, 1, n, 3).getValues();
    items = rows.map(function (r) { return { t: String(r[0]), n: String(r[1]), m: String(r[2]) }; }).reverse();
  }
  return json_({ ok: true, items: items });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.hp) return json_({ ok: false, error: 'spam' });          // 蜜罐欄位被填了
    var nick = clean_(d.n, MAX_NICK), msg = clean_(d.m, MAX_MSG);
    if (!nick || !msg) return json_({ ok: false, error: 'empty' });
    var cache = CacheService.getScriptCache();
    if (cache.get('last')) return json_({ ok: false, error: 'busy' });
    cache.put('last', '1', Math.ceil(MIN_GAP_MS / 1000));
    var t = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm');
    getSheet_().appendRow([t, nick, msg]);
    return json_({ ok: true, item: { t: t, n: nick, m: msg } });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
