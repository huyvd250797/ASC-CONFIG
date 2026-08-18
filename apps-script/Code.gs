/**
 * ASC-CONFIG — Web App ghi nhận thống kê sử dụng dùng chung.
 *
 * Đặt file này trong Apps Script gắn với chính spreadsheet ASC-CONFIG, rồi Deploy dạng
 * Web app. Xem hướng dẫn từng bước trong apps-script/HUONG-DAN.md
 *
 * - doPost : nhận gói sự kiện từ trình duyệt (gửi bằng sendBeacon) và cộng dồn vào sheet.
 * - doGet  : thống kê   — ?action=list | delete | reset
 *            chức năng  — ?action=tools | toolSave | toolDelete  (sheet ChucNang)
 *
 * Vì sao dùng JSONP cho phần đọc: Apps Script không đặt được header CORS cho fetch thông
 * thường. JSONP đi qua thẻ <script> nên không vướng CORS, và app đã dùng đúng kỹ thuật này
 * để đọc Google Sheet nên tái sử dụng được.
 */

/** Đổi thành chuỗi bí mật của riêng bạn, và sửa STATS_TOKEN trong src/config.ts cho khớp. */
var TOKEN = 'asc-config-huyvo257';

var SHEET_NAME = 'ThongKe';
var HEADERS = ['Key', 'Loại', 'Nhãn', 'Lượt xem', 'Lượt chép', 'Lần cuối', 'Phân hệ', 'Module'];
var STATS_CACHE_KEY = 'asc_config_stats_entries_v2';
var STATS_CACHE_SECONDS = 30;
var STATS_DEFAULT_LIMIT = 300;
var STATS_MAX_LIMIT = 1000;

/** Danh sách "Chức năng khác" hiển thị trong app. */
var TOOLS_SHEET = 'ChucNang';
var TOOLS_HEADERS = ['Id', 'Tên chức năng', 'Mô tả', 'Link', 'Chữ trên nút', 'Thứ tự', 'Cập nhật', 'Password'];

/* ------------------------------------------------------------------ *
 * Điểm vào
 * ------------------------------------------------------------------ */

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || '';
  var action = (e && e.parameter && e.parameter.action) || 'list';
  var payload;

  try {
    if (action === 'list') {
      payload = usagePayload(e.parameter);
    } else if (action === 'delete') {
      requireToken(e.parameter.token);
      deleteOne(e.parameter.key);
      payload = usagePayload(e.parameter);
    } else if (action === 'reset') {
      requireToken(e.parameter.token);
      resetAll();
      payload = { ok: true, entries: [] };
    } else if (action === 'tools') {
      payload = { ok: true, tools: readTools() };
    } else if (action === 'toolSave') {
      requireToken(e.parameter.token);
      saveTool(e.parameter);
      payload = { ok: true, tools: readTools() };
    } else if (action === 'toolDelete') {
      requireToken(e.parameter.token);
      deleteTool(e.parameter.id);
      payload = { ok: true, tools: readTools() };
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

function clearStatsCache() {
  try {
    CacheService.getScriptCache().remove(STATS_CACHE_KEY);
  } catch (err) {
    // Cache là tối ưu phụ, hỏng cache không được làm hỏng thống kê.
  }
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Tương thích dữ liệu cũ 6 cột nhưng không ghi lại header ở mọi lần đọc.
  // Việc ghi thừa này khiến Apps Script cold-start lâu và dễ làm popup thống kê timeout.
  var currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  var needsHeaderUpdate = false;
  for (var i = 0; i < HEADERS.length; i += 1) {
    if (currentHeaders[i] !== HEADERS[i]) {
      needsHeaderUpdate = true;
      break;
    }
  }
  if (needsHeaderUpdate) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  }
  if (sheet.getFrozenRows() !== 1) sheet.setFrozenRows(1);
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
    clearStatsCache();
    return applied;
  } finally {
    lock.releaseLock();
  }
}

function readEntriesFromSheet() {
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

function getCachedEntries() {
  var cache;
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(STATS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    cache = null;
  }

  var entries = readEntriesFromSheet();
  try {
    var json = JSON.stringify(entries);
    if (cache && json.length < 95000) cache.put(STATS_CACHE_KEY, json, STATS_CACHE_SECONDS);
  } catch (err2) {
    // Bảng lớn quá giới hạn cache thì bỏ qua cache, vẫn trả dữ liệu bình thường.
  }
  return entries;
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'vi', { numeric: true, sensitivity: 'base' });
}

function usagePayload(params) {
  var options = params || {};
  var entries = getCachedEntries();
  var query = normalizeSearchText(options.q || options.search || '');
  var filtered = [];
  var totalViews = 0;
  var totalCopies = 0;

  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    var haystack = normalizeSearchText([entry.key, entry.label, entry.phanHe, entry.module, entry.kind].join(' '));
    if (query && haystack.indexOf(query) === -1) continue;
    filtered.push(entry);
    totalViews += Number(entry.views) || 0;
    totalCopies += Number(entry.copies) || 0;
  }

  var sort = String(options.sort || 'copies');
  var direction = String(options.dir || 'desc') === 'asc' ? 1 : -1;
  var textSort = sort === 'label' || sort === 'phanHe' || sort === 'module';
  filtered.sort(function (a, b) {
    if (textSort) return compareText(a[sort], b[sort]) * direction || (Number(b.copies) || 0) - (Number(a.copies) || 0);
    return ((Number(a[sort]) || 0) - (Number(b[sort]) || 0)) * direction || (Number(b.copies) || 0) - (Number(a.copies) || 0);
  });

  var totalRows = filtered.length;
  var limit = Math.min(Math.max(Number(options.limit) || STATS_DEFAULT_LIMIT, 1), STATS_MAX_LIMIT);
  var offset = Math.max(Number(options.offset) || 0, 0);
  var page = filtered.slice(offset, offset + limit);

  return {
    ok: true,
    entries: page,
    totalRows: totalRows,
    totalViews: totalViews,
    totalCopies: totalCopies,
    offset: offset,
    limit: limit,
    partial: offset + page.length < totalRows,
  };
}

function readAll() {
  return usagePayload({ limit: STATS_MAX_LIMIT }).entries;
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
        clearStatsCache();
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
    clearStatsCache();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ *
 * Chức năng khác (sheet ChucNang)
 * ------------------------------------------------------------------ */

function getToolsSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TOOLS_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(TOOLS_SHEET);
    sheet.getRange(1, 1, 1, TOOLS_HEADERS.length).setValues([TOOLS_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Không ghi lại header ở mọi lần đọc: thao tác ghi thừa làm Web App cold-start lâu hơn.
  var currentHeaders = sheet.getRange(1, 1, 1, TOOLS_HEADERS.length).getDisplayValues()[0];
  var needsHeaderUpdate = false;
  for (var i = 0; i < TOOLS_HEADERS.length; i += 1) {
    if (currentHeaders[i] !== TOOLS_HEADERS[i]) {
      needsHeaderUpdate = true;
      break;
    }
  }
  if (needsHeaderUpdate) {
    sheet.getRange(1, 1, 1, TOOLS_HEADERS.length).setValues([TOOLS_HEADERS]).setFontWeight('bold');
  }
  if (sheet.getFrozenRows() !== 1) sheet.setFrozenRows(1);
  return sheet;
}

function readTools() {
  var sheet = getToolsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, TOOLS_HEADERS.length).getValues();
  var tools = [];

  for (var i = 0; i < values.length; i += 1) {
    var row = values[i];
    if (!row[0] || !row[1] || !row[3]) continue;
    var updatedAt = row[6] instanceof Date ? row[6].getTime() : Number(row[6]) || 0;
    tools.push({
      id: String(row[0]),
      name: String(row[1]),
      desc: String(row[2] || ''),
      url: String(row[3]),
      buttonLabel: String(row[4] || 'Truy cập'),
      order: Number(row[5]) || 0,
      updatedAt: updatedAt,
      password: String(row[7] || ''),
    });
  }

  tools.sort(function (a, b) {
    return a.order - b.order || a.name.localeCompare(b.name);
  });
  return tools;
}

/**
 * Thêm mới hoặc cập nhật một chức năng.
 * Có Id trùng dòng nào thì ghi đè dòng đó, không thì thêm dòng mới ở cuối.
 */
function saveTool(params) {
  var id = String((params && params.id) || '').trim();
  var name = String((params && params.name) || '').trim();
  var url = String((params && params.url) || '').trim();

  if (!id) throw new Error('Thiếu Id chức năng');
  if (!name) throw new Error('Thiếu tên chức năng');
  if (!/^https?:\/\//i.test(url)) throw new Error('Link phải bắt đầu bằng http:// hoặc https://');

  var row = [
    id,
    name.slice(0, 120),
    String((params && params.desc) || '').slice(0, 400),
    url.slice(0, 900),
    String((params && params.label) || 'Truy cập').slice(0, 24),
    Number((params && params.order) || 0) || 0,
    new Date(),
    String((params && params.password) || '').slice(0, 120),
  ];

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = getToolsSheet();
    var lastRow = sheet.getLastRow();
    var ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];

    for (var i = 0; i < ids.length; i += 1) {
      if (String(ids[i][0]) === id) {
        sheet.getRange(i + 2, 1, 1, TOOLS_HEADERS.length).setValues([row]);
        SpreadsheetApp.flush();
        return true;
      }
    }
    sheet.getRange(Math.max(lastRow, 1) + 1, 1, 1, TOOLS_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteTool(id) {
  var cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('Thiếu Id chức năng cần xóa');

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sheet = getToolsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i -= 1) {
      if (String(ids[i][0]) === cleanId) {
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
