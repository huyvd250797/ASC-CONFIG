/**
 * ASC-CONFIG — Web App ghi nhận thống kê sử dụng dùng chung.
 *
 * Đặt file này trong Apps Script gắn với chính spreadsheet ASC-CONFIG, rồi Deploy dạng
 * Web app. Xem hướng dẫn từng bước trong apps-script/HUONG-DAN.md
 *
 * - doPost : nhận gói sự kiện từ trình duyệt (gửi bằng sendBeacon) và cộng dồn vào sheet.
 * - doGet  : trả về thống kê JSONP (?action=list), xóa 1 dòng (?action=delete) hoặc xóa sạch (?action=reset).
 *
 * Vì sao dùng JSONP cho phần đọc: Apps Script không đặt được header CORS cho fetch thông
 * thường. JSONP đi qua thẻ <script> nên không vướng CORS, và app đã dùng đúng kỹ thuật này
 * để đọc Google Sheet nên tái sử dụng được.
 */

/** Đổi thành chuỗi bí mật của riêng bạn, và sửa STATS_TOKEN trong src/config.ts cho khớp. */
var TOKEN = 'asc-config-huyvo257';

var SHEET_NAME = 'ThongKe';
var HEADERS = ['Key', 'Loại', 'Nhãn', 'Lượt xem', 'Lượt chép', 'Lần cuối', 'Phân hệ', 'Module'];

/* ------------------------------------------------------------------ *
 * Điểm vào
 * ------------------------------------------------------------------ */

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || '';
  var action = (e && e.parameter && e.parameter.action) || 'list';
  var payload;

  try {
    if (action === 'list') {
      payload = { ok: true, entries: readAll() };
    } else if (action === 'delete') {
      requireToken(e.parameter.token);
      deleteOne(e.parameter.key);
      payload = { ok: true, entries: readAll() };
    } else if (action === 'reset') {
      requireToken(e.parameter.token);
      resetAll();
      payload = { ok: true, entries: [] };
    } else {
      payload = { ok: false, error: 'Hành động không hợp lệ: ' + action };
    }
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err) };
  }

  var body = JSON.stringify(payload);
  if (!callback) {
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(callback + '(' + body + ');').setMimeType(
    ContentService.MimeType.JAVASCRIPT,
  );
}

function doPost(e) {
  var payload;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requireToken(body.token);
    var applied = applyEvents(body.events || []);
    payload = { ok: true, applied: applied };
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/* ------------------------------------------------------------------ *
 * Nghiệp vụ
 * ------------------------------------------------------------------ */

function requireToken(token) {
  if (String(token || '') !== TOKEN) {
    throw new Error('Token không hợp lệ');
  }
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
  }
  // Tương thích dữ liệu cũ 6 cột: tự bổ sung hai cột metadata mới mà không xóa số liệu cũ.
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Cộng dồn các sự kiện vào sheet.
 *
 * LockService là bắt buộc: nhiều người bấm cùng lúc sẽ chạy nhiều bản doPost song song,
 * nếu không khóa thì các lần đọc-cộng-ghi đè lên nhau và số đếm bị mất.
 */
function applyEvents(events) {
  if (!events.length) return 0;

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);

  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues() : [];

    var indexByKey = {};
    for (var i = 0; i < values.length; i += 1) {
      indexByKey[String(values[i][0])] = i;
    }

    var now = new Date();
    var applied = 0;

    for (var j = 0; j < events.length; j += 1) {
      var event = events[j];
      var key = String(event.key || '').slice(0, 300);
      var views = Number(event.views) || 0;
      var copies = Number(event.copies) || 0;
      if (!key || (!views && !copies)) continue;

      var at = indexByKey[key];
      if (at === undefined) {
        indexByKey[key] = values.length;
        values.push([key, event.kind || '', event.label || '', views, copies, now, event.phanHe || '', event.module || '']);
      } else {
        var row = values[at];
        row[3] = (Number(row[3]) || 0) + views;
        row[4] = (Number(row[4]) || 0) + copies;
        row[5] = now;
        // Nhãn có thể đổi khi sửa Google Sheet, luôn lấy bản mới nhất.
        if (event.kind) row[1] = event.kind;
        if (event.label) row[2] = event.label;
        if (event.phanHe !== undefined) row[6] = event.phanHe || '';
        if (event.module !== undefined) row[7] = event.module || '';
      }
      applied += views + copies;
    }

    if (values.length) {
      sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
    }
    SpreadsheetApp.flush();
    return applied;
  } finally {
    lock.releaseLock();
  }
}

function readAll() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var entries = [];

  for (var i = 0; i < values.length; i += 1) {
    var row = values[i];
    if (!row[0]) continue;
    var lastAt = row[5] instanceof Date ? row[5].getTime() : 0;
    entries.push({
      key: String(row[0]),
      kind: String(row[1] || 'config'),
      label: String(row[2] || ''),
      phanHe: String(row[6] || ''),
      module: String(row[7] || ''),
      views: Number(row[3]) || 0,
      copies: Number(row[4]) || 0,
      lastAt: lastAt,
    });
  }
  return entries;
}


function deleteOne(key) {
  var cleanKey = String(key || '');
  if (!cleanKey) throw new Error('Thiếu key bản ghi cần xóa');

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    var keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = keys.length - 1; i >= 0; i -= 1) {
      if (String(keys[i][0]) === cleanKey) {
        sheet.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function resetAll() {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ *
 * Chạy thử trong trình soạn Apps Script (Run > kiemTraNhanh)
 * ------------------------------------------------------------------ */

function kiemTraNhanh() {
  var applied = applyEvents([
    { key: 'config|test_key', kind: 'config', label: 'TEST_KEY', phanHe: 'TEST', module: 'MODULE TEST', views: 1, copies: 2 },
  ]);
  Logger.log('Đã cộng: ' + applied);
  Logger.log(JSON.stringify(readAll()));
}
