// 桌面應用程式那種選單列：檔案／執行／檢視／說明。
// 每一項都只呼叫上層傳進來的函式，disabled／checked 也由上層決定——
// 選單自己判斷能不能按，就會和面板上的按鈕說法不一致。
// 沒有可用的項目一律 disabled 而不是隱藏。
// 此工具由虎門科技資深技術工程師 Jeff Hong 洪敬傑提供
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface MenuItem {
  separator?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

interface Props {
  menus: Menu[];
  right?: ReactNode;
}

export default function MenuBar({ menus, right }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 點到選單以外的任何地方就關閉；Escape 也關（優先於其他 Esc 行為）。
  useEffect(() => {
    if (open === null) return;
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="menubar" ref={rootRef}>
      <div className="menubar-menus">
        {menus.map((m, i) => (
          <div key={m.label} className="menu">
            <button
              className={"menu-label" + (open === i ? " on" : "")}
              onClick={() => setOpen(open === i ? null : i)}
              onMouseEnter={() => open !== null && setOpen(i)}
            >
              {m.label}
            </button>
            {open === i && (
              <div className="menu-pop">
                {m.items.map((it, j) =>
                  it.separator ? (
                    <div key={j} className="menu-sep" />
                  ) : (
                    <button
                      key={j}
                      className="menu-item"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(null);
                        it.onSelect?.();
                      }}
                    >
                      <span className="menu-tick">{it.checked ? "✓" : ""}</span>
                      <span className="menu-text">{it.label}</span>
                      {it.hint && <span className="menu-hint">{it.hint}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {right && <div className="menubar-right">{right}</div>}
    </div>
  );
}
