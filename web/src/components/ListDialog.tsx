import { useState } from 'react';
import { LIST_COLORS, LIST_EMOJIS, Modal } from './ui';

export function ListDialog({
  initial,
  onSave,
  onClose,
}: {
  initial?: { name: string; emoji: string | null; color: string };
  onSave: (name: string, emoji: string | null, color: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [color, setColor] = useState(initial?.color ?? 'blue');

  return (
    <Modal title={initial ? 'Redigera lista' : 'Ny lista'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim(), emoji, color);
        }}
      >
        <label className="field">
          <span>Namn</span>
          <input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Inköpslista" />
        </label>

        <div className="field">
          <span>Ikon</span>
          <div className="emoji-grid">
            <button type="button" className={'emoji-opt' + (emoji === null ? ' sel' : '')} onClick={() => setEmoji(null)} aria-label="Ingen ikon">
              –
            </button>
            {LIST_EMOJIS.map((e) => (
              <button type="button" key={e} className={'emoji-opt' + (emoji === e ? ' sel' : '')} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Färg</span>
          <div className="color-row">
            {Object.entries(LIST_COLORS).map(([key, hex]) => (
              <button
                type="button"
                key={key}
                className={'color-opt' + (color === key ? ' sel' : '')}
                style={{ background: hex }}
                onClick={() => setColor(key)}
                aria-label={key}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn btn-primary" disabled={!name.trim()}>
            {initial ? 'Spara' : 'Skapa lista'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
