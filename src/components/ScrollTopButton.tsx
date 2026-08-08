import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * Nút cuộn về đầu danh sách.
 *
 * Trên máy tính vùng cuộn là bảng dữ liệu bên trong; trên điện thoại bố cục trả về cuộn
 * trang bình thường nên vùng cuộn là chính cửa sổ. Component lắng nghe cả hai để hoạt động
 * đúng ở mọi kích thước màn hình.
 *
 * Hành vi hiển thị: cuộn xuống thì hiện lên trong 0.5s, dừng cuộn 2 giây thì mờ dần đi
 * trong 1s.
 */

const SHOW_AFTER = 220;
const IDLE_MS = 2000;
const FADE_OUT_MS = 1000;

export function ScrollTopButton({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const idleTimer = useRef(0);
  const removeTimer = useRef(0);

  const getScroller = useCallback(() => {
    const inner = containerRef.current?.querySelector<HTMLElement>('.grid-wrap, .card-list-wrap');
    // Phần tử chỉ thực sự là vùng cuộn khi nội dung cao hơn khung của nó.
    if (inner && inner.scrollHeight > inner.clientHeight + 4) return inner;
    return null;
  }, [containerRef]);

  const currentTop = useCallback(() => {
    const inner = getScroller();
    return inner ? inner.scrollTop : window.scrollY || document.documentElement.scrollTop;
  }, [getScroller]);

  useEffect(() => {
    const onScroll = () => {
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(removeTimer.current);

      if (currentTop() > SHOW_AFTER) {
        setMounted(true);
        setVisible(true);
        // Dừng cuộn đủ lâu thì cho mờ dần rồi gỡ khỏi cây DOM.
        idleTimer.current = window.setTimeout(() => {
          setVisible(false);
          removeTimer.current = window.setTimeout(() => setMounted(false), FADE_OUT_MS);
        }, IDLE_MS);
      } else {
        setVisible(false);
        removeTimer.current = window.setTimeout(() => setMounted(false), FADE_OUT_MS);
      }
    };

    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(removeTimer.current);
    };
  }, [currentTop]);

  if (!mounted) return null;

  return (
    <button
      type="button"
      className={`scroll-top ${visible ? 'show' : 'hide'}`}
      title="Lên đầu danh sách"
      aria-label="Lên đầu danh sách"
      onClick={() => {
        getScroller()?.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <ArrowUp size={18} />
    </button>
  );
}
