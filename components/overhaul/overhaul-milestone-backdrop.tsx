"use client";

import * as React from "react";
import { normalizeText } from "@/lib/nav";
import type { MilestoneEvent } from "@/lib/overhaul-milestones";
import styles from "./overhaul-milestone-backdrop.module.css";

export function milestoneAnimation(title: string) {
  const text = normalizeText(title);
  if (text.includes("tach luoi")) return "isolation";
  if (text.includes("cau ")) return "lifting";
  if (text.includes("dot lo")) return "firing";
  if (/ap luc|nen nuoc|bao hoi/.test(text)) return "pressure";
  if (text.includes("diesel")) return "diesel";
  if (text.includes("ngung tro truc")) return "turbine-stop";
  if (/tuabin|rotor|tro truc/.test(text)) return "turbine";
  if (/hoa dien|phan dien|mba|may phat/.test(text)) return "electrical";
  if (/nuoc|lam mat|flushing|bom/.test(text)) return "water";
  return "maintenance";
}

/** Minh hoạ trang trí theo nội dung kế hoạch; không biểu thị trạng thái thực hiện. */
export function MilestoneBackdrop({ events }: { events: MilestoneEvent[] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [running, setRunning] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setRunning(visible && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); motion.removeEventListener("change", update); };
  }, []);
  React.useEffect(() => {
    if (!running || events.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % events.length), 7000);
    return () => window.clearInterval(timer);
  }, [running, events.length]);
  const event = events[index % Math.max(events.length, 1)];
  const theme = event ? milestoneAnimation(event.title) : "maintenance";
  return <div ref={ref} className={styles.backdrop} data-running={running} data-animation-theme={theme} data-animation-milestone={event?.milestoneId ?? ""} aria-hidden="true">
    <div className={styles.grid} />
    <svg key={theme} viewBox="0 0 420 170" className={styles.scene} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 144H410M28 151H393" opacity=".45" />
      <path d="M25 142V95H61V75H110V142M45 95V56H58V95M72 87H94M72 104H94M72 120H94" opacity=".35" />
      <path d="M330 142V105H398V142M346 105V47H359V105M346 62H359M346 76H359M376 118H389" opacity=".35" />
      {theme === "isolation" ? <g>
        <path d="M151 142V51M269 142V51M139 66H163M257 66H281M139 79H163M257 79H281M151 96H185M235 96H269" />
        <path d="M185 96L224 64" className={styles.breaker} />
        <circle cx="185" cy="96" r="4" /><circle cx="235" cy="96" r="4" />
        <path d="M163 54H257" strokeDasharray="4 8" className={styles.flow} opacity=".6" />
      </g> : theme === "lifting" ? <g>
        <path d="M150 142V22H285M140 142H164M150 36L170 22M150 61L183 22M150 86L196 22" />
        <g className={styles.lift}><path d="M247 23V72Q247 84 258 76" /><rect x="211" y="87" width="83" height="25" rx="12" /><path d="M247 77L215 87M247 77L290 87M224 90V110M235 90V110M270 90V110M282 90V110" /></g>
      </g> : theme.startsWith("turbine") ? <g>
        <path d="M125 120H299M145 120V142M275 120V142M122 95H153M269 95H308" />
        <rect x="153" y="57" width="116" height="64" rx="26" />
        <g className={theme === "turbine-stop" ? undefined : styles.rotor}><circle cx="211" cy="89" r="25" /><path d="M211 65L216 81L235 78L220 90L231 109L213 98L196 111L200 93L186 80L204 82Z" /></g>
        <path d="M127 47H169M252 47H293" strokeDasharray="4 8" className={styles.flow} />
      </g> : theme === "pressure" ? <g>
        <path d="M133 142V109H170M250 109H292V142M170 109V124H250V109" />
        <circle cx="210" cy="79" r="38" /><path d="M185 90A27 27 0 0 1 236 90M185 65L190 68M210 51V58M235 65L230 69" />
        <path d="M210 79L228 61" className={styles.needle} /><circle cx="210" cy="79" r="4" />
        <path d="M132 128H170M250 128H293" strokeDasharray="3 7" className={styles.flow} />
      </g> : theme === "firing" ? <g>
        <rect x="152" y="42" width="122" height="100" rx="9" /><path d="M167 57H259M167 127H259M274 68H299V37M149 96H128" />
        <path d="M192 116C170 95 197 84 203 65C207 82 228 86 232 72C253 103 231 122 211 122C204 122 198 120 192 116Z" fill="currentColor" stroke="none" className={styles.flame} opacity=".45" />
        <path d="M194 112C188 102 205 95 210 86C225 104 224 115 211 117Z" fill="currentColor" stroke="none" className={styles.flame} />
      </g> : theme === "water" ? <g>
        <path d="M122 77H186M235 77H299V125H249M179 125H121V77" strokeWidth="7" opacity=".25" />
        <path d="M122 77H299V125H121V77" strokeDasharray="4 12" className={styles.flow} />
        <circle cx="211" cy="102" r="32" /><g className={styles.pump}><path d="M211 80C231 82 220 98 211 102C207 122 190 109 211 102C191 86 208 79 211 102Z" /></g>
        <path d="M190 134V142H234V134" />
      </g> : theme === "diesel" ? <g>
        <g className={styles.engine}><rect x="152" y="69" width="127" height="57" rx="8" /><path d="M164 69V53H198V69M248 69V42H267V51M164 86H197V111H164M242 83H266M242 93H266M242 103H266M152 96H135" /><circle cx="218" cy="97" r="15" /></g>
        <path d="M144 142H289M166 126V142M261 126V142" /><path d="M260 34Q270 26 260 18" className={styles.steam} />
      </g> : theme === "electrical" ? <g>
        <rect x="150" y="52" width="119" height="90" rx="8" /><path d="M168 65V41M187 65V35M249 65V41M159 76H259M159 86H259M159 96H259M159 106H259M125 130H151M269 130H298" />
        <path d="M218 64L192 98H214L204 126L238 86H217Z" fill="currentColor" stroke="none" className={styles.power} opacity=".65" />
        <path d="M113 41H299" strokeDasharray="3 11" className={styles.flow} />
      </g> : <g>
        <circle cx="210" cy="92" r="42" strokeDasharray="13 8" className={styles.gear} /><circle cx="210" cy="92" r="23" />
        <path d="M189 121L222 83C207 63 231 53 241 61L229 73L236 81L248 69C258 90 241 99 227 94L200 130Z" fill="currentColor" fillOpacity=".12" />
        <path d="M143 142H278M167 137V142M252 137V142" />
      </g>}
      <circle cx="311" cy="135" r="3" className={styles.power} /><circle cx="103" cy="135" r="3" className={styles.power} />
    </svg>
  </div>;
}
