"use client";

import { ArrowUp, BadgeCheck, Mic, MicOff, RotateCcw, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MonogramCover } from "@/components/business/monogram";
import { MediaImage } from "@/components/ui/media";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { localDateKey } from "@/lib/format";

type Result = {
  id: string;
  slug: string;
  name: string;
  categoryName: string | null;
  city: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  verified: boolean;
  logo: Parameters<typeof MediaImage>[0]["media"] | null;
  distanceKm: number | null;
  offersMobile: boolean;
  offersVirtual: boolean;
  timezone: string;
  service: { id: string; name: string; price: string; durationMinutes: number } | null;
  slots: string[];
};
type Reply = { reply: string; lang: "en" | "es"; results: Result[]; links: { label: string; href: string }[]; suggestions: string[]; mode: "local" | "ai" };
type Turn = { role: "user"; text: string } | { role: "assistant"; data: Reply } | { role: "error"; text: string };

const Ctx = createContext<{ open: (prefill?: string) => void }>({ open: () => {} });
export const useAssistant = () => useContext(Ctx);

const STORE = "kept_assistant";

/** App-wide "Ask Kept" panel. Conversation survives navigation within the tab. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const open = useCallback((prefill?: string) => {
    setPending(prefill?.trim() || null);
    setOpen(true);
  }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <AssistantPanel open={isOpen} onOpenChange={setOpen} pending={pending} clearPending={() => setPending(null)} />
    </Ctx.Provider>
  );
}

function loadTurns(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Turn[]).slice(-20) : [];
  } catch {
    return [];
  }
}

function AssistantPanel({ open, onOpenChange, pending, clearPending }: { open: boolean; onOpenChange: (o: boolean) => void; pending: string | null; clearPending: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const geo = useRef<{ lat: number; lng: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const recognizer = useRef<{ stop: () => void } | null>(null);
  const pathname = usePathname();
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    setTurns(loadTurns());
  }, [open]);

  useEffect(() => {
    try {
      if (loaded.current) sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-20)));
    } catch {
      /* private mode */
    }
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }, [turns]);

  // Following a link inside the panel closes it.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) onOpenChange(false);
    lastPath.current = pathname;
  }, [pathname, onOpenChange]);

  const send = useCallback(
    async (message: string) => {
      const m = message.trim();
      if (!m || busy) return;
      setText("");
      const history = turns
        .filter((t): t is Extract<Turn, { role: "user" }> | Extract<Turn, { role: "assistant" }> => t.role !== "error")
        .slice(-8)
        .map((t) => (t.role === "user" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: t.data.reply }));
      setTurns((ts) => [...ts, { role: "user", text: m }]);
      setBusy(true);
      // Location only when the person asks for something nearby — and only with their permission.
      if (/\b(near|nearby|closest|cerca|cercano)\b/i.test(m) && !geo.current && "geolocation" in navigator) {
        geo.current = await new Promise((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 6000, maximumAge: 600_000 },
          ),
        );
      }
      try {
        const data = await api<Reply>("/api/assistant", {
          body: { message: m, history, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...(geo.current ?? {}) },
        });
        setTurns((ts) => [...ts, { role: "assistant", data }]);
      } catch (err) {
        setTurns((ts) => [...ts, { role: "error", text: (err as ApiError).message }]);
      } finally {
        setBusy(false);
        input.current?.focus();
      }
    },
    [busy, turns],
  );

  useEffect(() => {
    if (open && pending) {
      clearPending();
      void send(pending);
    }
  }, [open, pending, clearPending, send]);

  const speech = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition) : undefined;

  function toggleVoice() {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    if (!speech) return;
    const R = speech as new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
    const r = new R();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.onresult = (e) => {
      const parts = Array.from(e.results);
      const said = parts.map((p) => p[0].transcript).join("");
      setText(said);
      if (parts.at(-1)?.isFinal) {
        r.stop();
        void send(said);
      }
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  }

  const lang = turns.findLast((t) => t.role === "assistant")?.role === "assistant" ? (turns.findLast((t) => t.role === "assistant") as Extract<Turn, { role: "assistant" }>).data.lang : typeof navigator !== "undefined" && navigator.language?.startsWith("es") ? "es" : "en";
  const starters = lang === "es" ? ["Barbero mañana por la tarde", "Uñas de gel este fin de semana", "Masaje cerca de mí hoy", "Clases de inglés en línea"] : ["A barber tomorrow afternoon", "Gel nails this weekend under $60", "Massage near me tonight", "Math tutor online"];

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content
          className="fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] flex-col rounded-t-xl bg-bg shadow-lg outline-none data-[state=open]:animate-sheet sm:inset-y-0 sm:start-auto sm:end-0 sm:h-dvh sm:w-[440px] sm:rounded-none sm:border-s sm:border-line"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3.5 pt-3 sm:pt-5">
            <div>
              <D.Title className="font-display text-[26px] leading-none text-ink">Ask Kept</D.Title>
              <D.Description className="mt-1.5 text-[13px] text-ink-3">{lang === "es" ? "Dime qué necesitas y cuándo. Busco horarios reales." : "Say what you need and when. I check real openings."}</D.Description>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button type="button" onClick={() => setTurns([])} className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={lang === "es" ? "Nueva conversación" : "New conversation"}>
                  <RotateCcw className="size-4" />
                </button>
              )}
              <D.Close className="flex size-10 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
                <X className="size-5" />
              </D.Close>
            </div>
          </header>

          <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <p className="text-[15px] leading-relaxed text-ink-2">{lang === "es" ? "Por ejemplo:" : "For example:"}</p>
                <div className="mt-3 flex flex-col items-start gap-2">
                  {starters.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-line bg-surface px-3.5 py-2 text-start text-sm text-ink hover:border-line-strong">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-ee-md bg-ink px-3.5 py-2 text-[15px] text-bg">{t.text}</p>
                </div>
              ) : t.role === "error" ? (
                <p key={i} className="text-sm text-danger">
                  {t.text}
                </p>
              ) : (
                <AnswerView key={i} data={t.data} onAsk={send} />
              ),
            )}
            {busy && (
              <div className="flex gap-1 py-2" aria-label={lang === "es" ? "Buscando" : "Searching"}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
          </div>

          <form
            className="border-t border-line bg-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-bg px-3 py-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
              <textarea
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={1}
                maxLength={500}
                placeholder={listening ? (lang === "es" ? "Te escucho…" : "Listening…") : lang === "es" ? "Barbero el sábado por la mañana…" : "A barber Saturday morning…"}
                aria-label={lang === "es" ? "Tu mensaje" : "Your message"}
                className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-ink-3 [field-sizing:content]"
              />
              {Boolean(speech) && (
                <button type="button" onClick={toggleVoice} className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", listening ? "bg-danger-soft text-danger" : "text-ink-3 hover:bg-surface-2 hover:text-ink")} aria-label={listening ? "Stop listening" : "Speak"} aria-pressed={listening}>
                  {listening ? <MicOff className="size-[18px]" /> : <Mic className="size-[18px]" />}
                </button>
              )}
              <button type="submit" disabled={!text.trim() || busy} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-bg disabled:opacity-30" aria-label="Send">
                <ArrowUp className="size-[18px]" />
              </button>
            </div>
          </form>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** "Tomorrow 3:30 PM" / "mañana 15:30" in the conversation's language and the business's zone. */
function slotLabel(iso: string, tz: string, lang: "en" | "es") {
  const locale = lang === "es" ? "es" : "en-US";
  const now = new Date();
  const day = localDateKey(iso, tz);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  if (day === localDateKey(now, tz)) return `${lang === "es" ? "Hoy" : "Today"} ${time}`;
  if (day === localDateKey(new Date(now.getTime() + 86_400_000), tz)) return `${lang === "es" ? "Mañana" : "Tomorrow"} ${time}`;
  const wd = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz }).format(new Date(iso));
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1).replace(".", "")} ${time}`;
}

function AnswerView({ data, onAsk }: { data: Reply; onAsk: (s: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{data.reply}</p>
      {data.results.length > 0 && (
        <ul className="space-y-2.5">
          {data.results.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface p-3.5">
              <Link href={`/${r.slug}`} className="flex items-center gap-3">
                <span className="size-11 shrink-0 overflow-hidden rounded-lg">{r.logo ? <MediaImage media={r.logo} sizes="44px" className="size-full" /> : <MonogramCover name={r.name} size="sm" className="size-full [&_span]:text-lg" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-[15px] font-medium text-ink">
                    {r.name}
                    {r.verified && <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified" />}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                    {r.ratingCount > 0 && (
                      <>
                        <Star className="size-3 fill-ink text-ink" aria-hidden />
                        <span className="text-ink-2 tabular">{r.ratingAvg?.toFixed(1)}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    {[r.categoryName, r.offersVirtual && !r.city ? "Online" : r.city, r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Link>
              {r.service && (
                <p className="mt-2.5 flex justify-between gap-3 border-t border-line pt-2.5 text-[13px]">
                  <span className="truncate text-ink-2">{r.service.name}</span>
                  <span className="shrink-0 font-medium text-ink tabular">{r.service.price}</span>
                </p>
              )}
              {r.slots.length > 0 && r.service && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.slots.map((s) => (
                    <Link key={s} href={`/${r.slug}/book?service=${r.service!.id}&start=${encodeURIComponent(s)}`} className="inline-flex h-8 items-center rounded-md bg-accent-soft px-2.5 text-[13px] font-medium text-accent-text hover:bg-accent hover:text-accent-ink">
                      {slotLabel(s, r.timezone, data.lang)}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2">
              {l.label}
            </Link>
          ))}
        </div>
      )}
      {data.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.suggestions.map((s) => (
            <button key={s} type="button" onClick={() => onAsk(s)} className="h-8 rounded-md border border-dashed border-line-strong px-2.5 text-[13px] text-ink-2 hover:border-ink-3 hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
