'use client';

import { useEffect, useState } from 'react';

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > Math.min(640, window.innerHeight * .75));
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  return (
    <button
      type="button"
      className={`back-to-top${visible ? ' is-visible' : ''}`}
      aria-label="Наверх страницы"
      title="Наверх"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
