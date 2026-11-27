import { createElement, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { BookOpen, ClipboardCheck, Download, List, Maximize2, RotateCcw, X } from "lucide-react";
import { worldDisplay } from "../lib/worlds/display";
import { isWorld } from "../lib/worlds/types";
import type { ReferenceKind } from "../lib/workspace-route";
import "./workspace-reference.css";

type Chapter = { id: string; title: string };
type Article = { kind: ReferenceKind; contents: ReactNode; chapters: Chapter[] };
type Props = { kind: ReferenceKind; onClose: () => void; onNavigate: (url: string) => void };

const allowedTags = new Set(
  "a article b blockquote br code dd div dl dt em figcaption figure h1 h2 h3 h4 hr i img li ol p pre small span strong table tbody td th thead tr ul".split(
    " ",
  ),
);
const allowedClasses = new Set(["cases", "scene-link", "audio", "table-wrap"]);
const manualPath = "/docs/index.html";

function linkURL(raw: string, source: URL) {
  if (!raw) return null;
  try {
    const url = new URL(raw, source);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function readArticle(text: string, kind: ReferenceKind, source: URL): Article {
  const chapters: Chapter[] = [];
  if (kind.startsWith("credits:")) {
    const contents = text
      .trim()
      .split(/\r?\n\s*\n/)
      .map((paragraph, i) => (
        <p className="ref-credit" key={i}>
          {paragraph.split(/(https?:\/\/[^\s<>]+)/).map((part, j) =>
            /^https?:\/\//.test(part) ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer">
                {part}
              </a>
            ) : (
              part
            ),
          )}
        </p>
      ));
    return { kind, contents, chapters };
  }
  const sourceMain = new DOMParser().parseFromString(text, "text/html").querySelector("main");
  if (!sourceMain?.querySelector("h1")) throw new Error("文件格式錯誤");
  const render = (node: Node, key: number): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.localName;
    if (!allowedTags.has(tag)) return null;
    const attrs: Record<string, string | number | boolean> = { key };
    if (node.id) attrs.id = "ref-" + node.id;
    if (tag === "h2") {
      const id = node.id || "chapter-" + (chapters.length + 1);
      attrs.id = "ref-" + id;
      chapters.push({ id, title: node.textContent?.trim() || id });
    }
    const classes = Array.from(node.classList).filter((name) => allowedClasses.has(name));
    if (classes.length) attrs.className = classes.map((c) => "ref-" + c).join(" ");
    if (tag === "img") {
      const url = linkURL(node.getAttribute("src") || "", source);
      if (!url || url.origin !== source.origin) return null;
      return <img key={key} loading="lazy" src={url.href} alt={node.getAttribute("alt") || ""} />;
    }
    if (tag === "a") {
      const url = linkURL(node.getAttribute("href") || "", source);
      if (!url) return node.textContent;
      attrs.href = url.href;
      if (url.origin !== source.origin) {
        attrs.target = "_blank";
        attrs.rel = "noopener noreferrer";
      } else if (node.hasAttribute("download"))
        attrs.download = node.getAttribute("download") || true;
      else if (/\.(?:webp|png|jpe?g)$/i.test(url.pathname)) {
        attrs["data-ref-image"] = "";
        attrs["aria-label"] = "放大驗證截圖";
      }
    }
    if (tag === "br" || tag === "hr") return createElement(tag, attrs);
    return createElement(tag, attrs, Array.from(node.childNodes, render));
  };
  return { kind, contents: Array.from(sourceMain.childNodes, render), chapters };
}

export function WorkspaceReference({ kind, onClose, onNavigate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const imageLink = useRef<HTMLAnchorElement | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [problem, setProblem] = useState(""),
    [attempt, retry] = useState(0);
  const [chapter, setChapter] = useState("");
  const [picture, setPicture] = useState<{ src: string; alt: string } | null>(null);
  const world = kind.startsWith("credits:") ? kind.slice(8) : "";
  const path =
    kind === "manual"
      ? manualPath
      : kind === "verification"
        ? "/verification.html"
        : isWorld(world)
          ? "/worlds/" + world + "/credits.txt"
          : "";
  const title =
    kind === "manual"
      ? "系統手冊"
      : kind === "verification"
        ? "驗證紀錄"
        : (isWorld(world) ? worldDisplay[world].name + " · " : "") + "素材來源";
  const Icon = kind === "verification" ? ClipboardCheck : BookOpen;
  const current = article?.kind === kind ? article : null;

  useEffect(() => {
    const el = dialog.current!;
    const origin = document.activeElement;
    el.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      el.close();
      if (origin instanceof HTMLElement && origin.isConnected && origin.getClientRects().length)
        origin.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProblem("");
    setChapter("");
    setPicture(null);
    setArticle(null);
    if (body.current) body.current.scrollTop = 0;
    async function read() {
      try {
        if (!path) throw new Error("無效的文件");
        const source = new URL(path, location.origin);
        const response = await fetch(source, { signal: controller.signal });
        if (!response.ok) throw new Error("文件暫時無法載入");
        const text = await response.text();
        if (!controller.signal.aborted) setArticle(readArticle(text, kind, source));
      } catch {
        if (!controller.signal.aborted) setProblem("暫時無法載入這份文件。");
      }
    }
    void read();
    return () => controller.abort();
  }, [kind, path, attempt]);

  function goTo(id: string) {
    const root = body.current;
    if (!root) return;
    setChapter(current?.chapters.some((c) => c.id === id) ? id : "");
    const target = id ? root.querySelector<HTMLElement>("#" + CSS.escape("ref-" + id)) : null;
    const top = target
      ? target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 12
      : 0;
    root.scrollTo({ top });
  }
  useEffect(() => {
    const anchor = location.hash.slice(1);
    if (current && /^(?:section|chapter)-\d+$/.test(anchor)) goTo(anchor);
  }, [current]);
  function returnFromPicture() {
    setPicture(null);
    requestAnimationFrame(() => imageLink.current?.focus({ preventScroll: true }));
  }
  function link(event: MouseEvent<HTMLDivElement>) {
    const a = (event.target as Element).closest("a[href]");
    if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("download")) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    if (a.hasAttribute("data-ref-image")) {
      imageLink.current = a;
      setPicture({ src: url.href, alt: a.querySelector("img")?.alt || "驗證截圖" });
    } else if (url.pathname === path && url.hash) {
      goTo(decodeURIComponent(url.hash.slice(1)));
    } else if (url.pathname === "/" && !url.search && !url.hash) {
      onClose();
    } else {
      onNavigate(url.pathname + url.search + url.hash);
    }
  }

  return (
    <dialog
      className="station-reference"
      ref={dialog}
      aria-labelledby="ref-title"
      onCancel={(event) => {
        event.preventDefault();
        if (picture) returnFromPicture();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          onClose();
      }}
    >
      <header className="ref-header">
        <div>
          <Icon size={21} aria-hidden="true" />
          <h2 id="ref-title">{title}</h2>
        </div>
        <button className="ref-close" onClick={onClose} ref={closeButton} aria-label="關閉閱讀面板">
          <X size={19} />
          <span>關閉</span>
        </button>
      </header>
      {current && !picture && (current.chapters.length > 0 || kind === "manual") && (
        <nav className="ref-tools" aria-label="文件導覽">
          {current.chapters.length > 0 && (
            <label className="ref-chapters">
              <List size={17} aria-hidden="true" />
              <select aria-label="前往章節" value={chapter} onChange={(e) => goTo(e.target.value)}>
                <option value="">章節目錄</option>
                {current.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "manual" && (
            <div className="ref-downloads">
              <Download size={16} aria-hidden="true" />
              <a href="/docs/stewart-playground-manual.pdf" download aria-label="下載 PDF 手冊">
                PDF
              </a>
              <a href="/docs/stewart-playground-manual.md" download aria-label="下載 Markdown 手冊">
                Markdown
              </a>
            </div>
          )}
          {kind === "verification" && (
            <button className="ref-inline" onClick={() => onNavigate(manualPath)}>
              系統手冊
            </button>
          )}
        </nav>
      )}
      <div ref={body} className="ref-body" hidden={!!picture} onClick={link}>
        {problem ? (
          <div className="ref-state" role="alert">
            {problem}
            <button onClick={() => retry((a) => a + 1)}>
              <RotateCcw size={16} />
              重新載入
            </button>
          </div>
        ) : current ? (
          <article className="ref-article">{current.contents}</article>
        ) : (
          <p className="ref-state" role="status">
            載入中…
          </p>
        )}
      </div>
      {picture && (
        <div className="ref-image-view">
          <button onClick={returnFromPicture} autoFocus>
            <Maximize2 size={16} />
            返回紀錄
          </button>
          <img src={picture.src} alt={picture.alt} />
        </div>
      )}
    </dialog>
  );
}
export default WorkspaceReference;
