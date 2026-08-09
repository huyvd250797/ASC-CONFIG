import { useEffect } from 'react';

type SavedStyles = {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverscroll: string;
};

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: SavedStyles | null = null;

function lockPageScroll() {
  lockCount += 1;
  if (lockCount > 1) return;

  const html = document.documentElement;
  const body = document.body;
  savedScrollY = window.scrollY;
  savedStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverscroll: body.style.overscrollBehavior,
  };

  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${savedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overscrollBehavior = 'none';
}

function unlockPageScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || !savedStyles) return;

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = savedStyles.htmlOverflow;
  html.style.overscrollBehavior = savedStyles.htmlOverscroll;
  body.style.overflow = savedStyles.bodyOverflow;
  body.style.position = savedStyles.bodyPosition;
  body.style.top = savedStyles.bodyTop;
  body.style.left = savedStyles.bodyLeft;
  body.style.right = savedStyles.bodyRight;
  body.style.width = savedStyles.bodyWidth;
  body.style.overscrollBehavior = savedStyles.bodyOverscroll;

  const restoreY = savedScrollY;
  savedStyles = null;
  requestAnimationFrame(() => window.scrollTo(0, restoreY));
}

/** Khóa trang phía sau modal, kể cả Safari/iOS; nội dung modal vẫn cuộn độc lập. */
export function useModalScrollLock() {
  useEffect(() => {
    lockPageScroll();
    return unlockPageScroll;
  }, []);
}
