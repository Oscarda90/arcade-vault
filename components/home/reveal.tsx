"use client";

import { useEffect } from "react";

/**
 * Añade la clase `in` a cada `.reveal` del documento cuando entra en viewport
 * (threshold 0.12). Con prefers-reduced-motion la añade de inmediato.
 * Se renderiza una sola vez dentro de la Home; no pinta nada.
 */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const show = (el: Element) => el.classList.add("in");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach(show);
      return;
    }

    // Los que ya están en viewport al montar se muestran sin esperar al observer.
    const vh = window.innerHeight;
    const pending = els.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        show(el);
        return false;
      }
      return true;
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            show(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    pending.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
