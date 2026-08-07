import { useCallback, useEffect, useState } from 'react';

/**
 * Chế độ hiển thị của app. Mặc định là nền tối; lựa chọn của người dùng được nhớ lại
 * ở localStorage nên mở lại trang vẫn giữ nguyên.
 */

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'asc-config-theme';
export const DEFAULT_THEME: Theme = 'dark';

function readStored(): Theme {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  // Để thanh cuộn hệ thống và ô nhập liệu mặc định cũng đổi theo.
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? DEFAULT_THEME : readStored()));

  useEffect(() => {
    apply(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Trình duyệt chặn lưu trữ: vẫn đổi giao diện, chỉ là không nhớ được cho lần sau.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
