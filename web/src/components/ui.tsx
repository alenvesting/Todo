import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Profile } from '../lib/types';
import { useStore } from '../store';
import { XIcon } from './Icons';

export const LIST_COLORS: Record<string, string> = {
  blue: '#2f6fde',
  green: '#1f8a5b',
  teal: '#0f8a94',
  purple: '#7a4fd6',
  pink: '#d03f86',
  red: '#d4473b',
  orange: '#d9731a',
  gray: '#5f6b7a',
};

export const LIST_EMOJIS = ['🛒', '🏠', '✅', '📋', '🎁', '🧹', '🍳', '💊', '🐶', '🌱', '✈️', '🎉', '💼', '📚', '🛠️', '❤️'];

export function colorOf(name: string | null | undefined): string {
  return LIST_COLORS[name ?? 'blue'] ?? LIST_COLORS.blue;
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const avatarColors = ['#2f6fde', '#1f8a5b', '#7a4fd6', '#d03f86', '#d9731a', '#0f8a94'];

export function Avatar({ profile, name, size = 28 }: { profile?: Profile; name?: string; size?: number }) {
  const label = name ?? profile?.display_name ?? profile?.email ?? '?';
  const [broken, setBroken] = useState(false);
  const hash = [...(profile?.id ?? label)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (profile?.avatar_url && !broken) {
    return (
      <img
        className="avatar"
        style={style}
        src={profile.avatar_url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="avatar" style={{ ...style, background: avatarColors[Math.abs(hash) % avatarColors.length] }} title={label}>
      {initials(label)}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Stäng">
            <XIcon />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  checked?: boolean;
  onClick: () => void;
}

export function Menu({ trigger, items, label }: { trigger: ReactNode; items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={'menu-item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : '')}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function readSetting<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : initial;
  } catch {
    return initial;
  }
}

/** Liten inställning som sparas i webbläsaren (t.ex. sortering per lista) */
export function useLocalSetting<T>(key: string, initial: T): [T, (v: T) => void] {
  const [state, setState] = useState(() => ({ key, value: readSetting(key, initial) }));
  const value = state.key === key ? state.value : readSetting(key, initial);
  const set = (v: T) => {
    setState({ key, value: v });
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignorera */
    }
  };
  return [value, set];
}
