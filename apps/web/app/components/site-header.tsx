"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { HeaderSearch } from "./header-search";
import { SiteMenu } from "./site-menu";

type SeasonItem = { year: number };

const navigation = [
  ["Главная", "/"],
  ["Атлас", "/#atlas"],
  ["Сезон", "/#season"],
  ["Трассы", "/circuits"],
  ["Пилоты", "/drivers"],
  ["Команды", "/teams"],
  ["Аналитика", "/analytics"],
  ["Игры", "/games"],
  ["История", "/history"],
  ["О проекте", "/about"],
] as const;

function activeHrefForPath(pathname: string) {
  const route = navigation.find(
    ([, href]) =>
      !href.includes("#") && href !== "/" && pathname.startsWith(href),
  );
  return route?.[1] ?? "/";
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const seasonRef = useRef<HTMLDivElement>(null);
  const activeLockRef = useRef<string | null>(null);
  const activeLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seasons, setSeasons] = useState<SeasonItem[]>([
    { year: 2027 },
    { year: 2026 },
  ]);
  const [selectedSeason, setSelectedSeason] = useState(2026);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [activeHref, setActiveHref] = useState(() =>
    activeHrefForPath(pathname),
  );

  useLayoutEffect(() => {
    const pendingHref = window.sessionStorage.getItem("f1-navigation-target");
    if (!pendingHref) return;
    activeLockRef.current = pendingHref;
    queueMicrotask(() => setActiveHref(pendingHref));
  }, []);

  useEffect(() => {
    const syncSelectedSeason = () => {
      const fromUrl = Number(
        new URLSearchParams(window.location.search).get("season"),
      );
      if (fromUrl >= 1950 && fromUrl <= 2027) setSelectedSeason(fromUrl);
    };
    syncSelectedSeason();
    fetch("/data/f1/seasons.json")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { seasons?: SeasonItem[] }) => {
        if (data.seasons?.length) setSeasons(data.seasons);
      })
      .catch(() => undefined);
    window.addEventListener("popstate", syncSelectedSeason);
    return () => window.removeEventListener("popstate", syncSelectedSeason);
  }, []);

  useEffect(() => {
    if (!seasonOpen) return;
    const close = (event: PointerEvent) => {
      if (!seasonRef.current?.contains(event.target as Node))
        setSeasonOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [seasonOpen]);

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      if (activeLockRef.current) {
        setActiveHref(activeLockRef.current);
        return;
      }
      if (pathname !== "/") {
        setActiveHref(activeHrefForPath(pathname));
        return;
      }
      const probe = window.scrollY + 74 + window.innerHeight * 0.28;
      const atlas = document.getElementById("atlas");
      const season = document.getElementById("season");
      let next = "/";
      if (atlas && atlas.offsetTop <= probe) next = "/#atlas";
      if (season && season.offsetTop <= probe) next = "/#season";
      setActiveHref(next);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveSection);
    };
    const hashHref =
      pathname === "/" &&
      ["#atlas", "#season", "#history"].includes(window.location.hash)
        ? `/${window.location.hash}`
        : null;
    if (hashHref) {
      activeLockRef.current = hashHref;
      setActiveHref(hashHref);
      activeLockTimerRef.current = setTimeout(() => {
        activeLockRef.current = null;
        window.sessionStorage.removeItem("f1-navigation-target");
        scheduleUpdate();
      }, 900);
    } else {
      activeLockRef.current = null;
      scheduleUpdate();
    }
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      if (activeLockTimerRef.current) clearTimeout(activeLockTimerRef.current);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [pathname]);

  function prepareNavigation(href: string) {
    if (activeLockTimerRef.current) clearTimeout(activeLockTimerRef.current);
    activeLockRef.current = href;
    window.sessionStorage.setItem("f1-navigation-target", href);
    setActiveHref(href);
    activeLockTimerRef.current = setTimeout(() => {
      activeLockRef.current = null;
      window.sessionStorage.removeItem("f1-navigation-target");
    }, 900);
  }

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    prepareNavigation(href);
    if (pathname !== "/" || !["/", "/#atlas", "/#season"].includes(href))
      return;
    event.preventDefault();
    const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    window.history.pushState(null, "", hash || "/");
    if (target) target.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: 0, behavior });
  }

  useEffect(() => {
    let frame = 0;
    const positionIndicator = () => {
      const nav = navRef.current;
      const indicator = indicatorRef.current;
      const link = Array.from(
        nav?.querySelectorAll<HTMLElement>("[data-nav-href]") ?? [],
      ).find((item) => item.dataset.navHref === activeHref);
      if (!nav || !indicator || !link) return;
      const navRect = nav.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      indicator.style.width = `${linkRect.width}px`;
      indicator.style.transform = `translate3d(${linkRect.left - navRect.left}px, 0, 0)`;
      indicator.style.opacity = "1";
    };
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionIndicator);
    };
    schedulePosition();
    window.addEventListener("resize", schedulePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePosition);
    };
  }, [activeHref]);

  return (
    <header className="topbar site-header" id="top">
      <Link
        className="brand"
        href="/"
        aria-label="География скорости — главная"
      >
        <span className="brand-mark" aria-hidden="true">
          <Image src="/icon.svg" alt="" width={54} height={32} />
        </span>
        <span>
          <strong>География скорости</strong>
          <small>Скорость • География • История</small>
        </span>
      </Link>
      <nav ref={navRef} className="topnav" aria-label="Основная навигация">
        {navigation.map(([label, href]) => (
          <Link
            key={label}
            data-nav-href={href}
            className={activeHref === href ? "is-active" : ""}
            aria-current={activeHref === href ? "page" : undefined}
            href={href}
            onClick={(event) => navigate(event, href)}
          >
            {label}
          </Link>
        ))}
        <span
          ref={indicatorRef}
          className="topnav-indicator"
          aria-hidden="true"
        />
      </nav>
      <div className="topbar-actions">
        <HeaderSearch />
        <div
          ref={seasonRef}
          className="season-control"
          aria-label="Выбранный сезон"
        >
          <span>Сезон</span>
          <button
            type="button"
            className="season-menu-trigger"
            aria-haspopup="listbox"
            aria-expanded={seasonOpen}
            onClick={() => setSeasonOpen((open) => !open)}
          >
            {selectedSeason}
            <span aria-hidden="true">⌄</span>
          </button>
          {seasonOpen && (
            <div
              className="season-menu"
              role="listbox"
              aria-label="Выберите сезон"
            >
              {seasons.map((season) => (
                <button
                  key={season.year}
                  type="button"
                  role="option"
                  aria-selected={season.year === selectedSeason}
                  className={
                    season.year === selectedSeason ? "is-selected" : ""
                  }
                  onClick={() => {
                    setSeasonOpen(false);
                    setSelectedSeason(season.year);
                    const params = new URLSearchParams(window.location.search);
                    params.set("season", String(season.year));
                    const target = `${pathname}?${params.toString()}${window.location.hash}`;
                    router.replace(target, { scroll: false });
                    window.dispatchEvent(
                      new CustomEvent("f1-season-change", {
                        detail: { season: season.year },
                      }),
                    );
                  }}
                >
                  {season.year}
                </button>
              ))}
            </div>
          )}
        </div>
        <SiteMenu />
      </div>
    </header>
  );
}
