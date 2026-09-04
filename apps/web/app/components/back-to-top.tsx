'use client';

import { useEffect, useState } from 'react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: number | null = null;
    const updateVisibility = () => {
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      const isAwayFromTop = window.scrollY > Math.min(640, window.innerHeight * .75);
      setVisible(isAwayFromTop);
      if (isAwayFromTop) {
        hideTimer = window.setTimeout(() => setVisible(false), 850);
      }
    };
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      aria-label="Наверх страницы"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title="Наверх"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
