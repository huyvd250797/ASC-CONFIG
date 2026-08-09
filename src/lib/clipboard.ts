/**
 * Sao chép văn bản vào clipboard.
 *
 * Clipboard API chỉ hoạt động trong ngữ cảnh bảo mật (https hoặc localhost). Khi mở
 * bản build bằng file:// hoặc qua http nội bộ, API này không có, nên cần một đường lui
 * bằng textarea ẩn + execCommand để chức năng vẫn dùng được.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Rơi xuống cách dự phòng bên dưới.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.dataset.allowNativeCopy = 'true';
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
