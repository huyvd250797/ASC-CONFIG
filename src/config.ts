/**
 * Cấu hình đồng bộ thống kê dùng chung.
 *
 * Để trống STATS_ENDPOINT thì app vẫn chạy bình thường, chỉ là thống kê nằm riêng ở
 * localStorage của từng máy như trước. Điền URL vào là tự động bật chế độ dùng chung.
 *
 * Cách lấy URL: xem apps-script/HUONG-DAN.md
 */

/** URL Web App của Apps Script, dạng https://script.google.com/macros/s/..../exec */
export const STATS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyYOuuOObVyjKnlxAnYtd3Q1gs7NoeFcCIZr80SFuhG56Q7Y5Ft31qDAujyObN4PgaCeQ/exec';

/** Phải trùng với biến TOKEN trong apps-script/Code.gs */
export const STATS_TOKEN = 'asc-config-huyvo257';

/** Gom sự kiện bao lâu thì gửi lên server một lần (ms). */
export const STATS_FLUSH_MS = 10000;

export const remoteStatsEnabled = () => STATS_ENDPOINT.trim().length > 0;
