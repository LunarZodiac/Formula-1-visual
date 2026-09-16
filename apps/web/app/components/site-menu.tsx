"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

const sections = [
  {
    label: "Навигация",
    links: [
      ["Главная", "/"],
      ["Атлас", "/#atlas"],
      ["Сезон", "/#season"],
      ["Трассы", "/circuits"],
    ],
  },
  {
    label: "Энциклопедия",
    links: [
      ["Пилоты", "/drivers"],
      ["Команды", "/teams"],
      ["Аналитика", "/analytics"],
      ["История", "/history"],
    ],
  },
  {
    label: "Проект",
    links: [
      ["Игры", "/games"],
      ["Избранное", "/favorites"],
      ["Поиск", "/search"],
      ["О проекте", "/about"],
    ],
  },
] as const;

export function SiteMenu({ floating = false }: { floating?: boolean }) {
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  function closeMenu(returnFocus = true) {
    setOpen(false);
    if (returnFocus)
      window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href]",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const drawer = open
    ? createPortal(
        <div
          className="site-menu-layer"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeMenu();
          }}
        >
          <aside
            className="site-menu-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-menu-title"
            onKeyDown={handlePanelKeyDown}
          >
            <header>
              <div>
                <span>Навигация</span>
                <strong id="site-menu-title">География скорости</strong>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => closeMenu()}
                aria-label="Закрыть меню"
              >
                ×
              </button>
            </header>
            <div className="site-menu-sections">
              {sections.map((section) => (
                <section key={section.label}>
                  <h2>{section.label}</h2>
                  <nav aria-label={section.label}>
                    {section.links.map(([label, href]) => {
                      const targetPath = href.split("#")[0] || "/";
                      const active =
                        !href.includes("#") &&
                        (targetPath === "/"
                          ? pathname === "/"
                          : pathname.startsWith(targetPath));
                      return (
                        <Link
                          className={active ? "is-active" : ""}
                          aria-current={active ? "page" : undefined}
                          href={href}
                          key={href}
                          onClick={() => closeMenu(false)}
                        >
                          <span>{label}</span>
                          <i aria-hidden="true">→</i>
                        </Link>
                      );
                    })}
                  </nav>
                </section>
              ))}
            </div>
            <footer>
              <span>Скорость · География · История</span>
              <small>Интерактивный атлас Formula 1</small>
            </footer>
          </aside>
        </div>,
        document.body,
      )
    : null;

  if (floating && pathname === "/") return null;

  return (
    <>
      <button
        ref={triggerRef}
        className={`site-menu-trigger${floating ? " site-menu-trigger--floating" : ""}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>Меню</span>
        <i aria-hidden="true">
          <b />
          <b />
          <b />
        </i>
      </button>
      {drawer}
    </>
  );
}
