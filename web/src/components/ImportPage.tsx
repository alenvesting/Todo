import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { myLists } from '../lib/selectors';
import {
  fetchMsLists,
  fetchMsTasks,
  finishMicrosoftAuth,
  importRedirectUri,
  listName,
  mapTask,
  msClientId,
  startMicrosoftAuth,
  type GraphList,
  type ImportTask,
} from '../lib/msTodo';
import { useStore } from '../store';
import { ChevronLeft, MicrosoftLogo } from './Icons';
import { LIST_COLORS } from './ui';

interface Candidate {
  id: string;
  name: string;
  emoji: string | null;
  shared: boolean;
  flagged: boolean;
  exists: boolean;
  tasks: ImportTask[];
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading'; text: string }
  | { kind: 'select'; lists: Candidate[] }
  | { kind: 'done'; lists: number; tasks: number }
  | { kind: 'error'; text: string };

const colors = Object.keys(LIST_COLORS);

/** Svaret från Microsoft kommer i URL-fragmentet */
const msParams = () => new URLSearchParams(window.location.hash.slice(1));

export function ImportPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>(() =>
    msParams().has('code') ? { kind: 'loading', text: 'Loggar in hos Microsoft…' } : { kind: 'intro' },
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeDone, setIncludeDone] = useState(false);
  const started = useRef(false);

  // Återkomst från Microsoft: byt kod mot token och hämta allt
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const search = msParams();
    if (!search.has('code') && !search.has('error')) return;
    window.history.replaceState(null, '', '/import'); // koden ska inte ligga kvar i adressfältet

    (async () => {
      try {
        const token = await finishMicrosoftAuth(search);
        if (!token) return setPhase({ kind: 'intro' });
        setPhase({ kind: 'loading', text: 'Hämtar dina listor…' });
        const lists = await fetchMsLists(token);
        const existing = new Set(myLists(store.data, store.user.id).map((l) => l.name.trim().toLowerCase()));
        const out: Candidate[] = [];
        for (const [i, l] of lists.entries()) {
          setPhase({ kind: 'loading', text: `Hämtar uppgifter (${i + 1} av ${lists.length}): ${l.displayName}` });
          out.push(toCandidate(l, (await fetchMsTasks(token, l.id)).map(mapTask), existing));
        }
        setSelected(new Set(out.filter((c) => !c.flagged && !c.exists && c.tasks.length > 0).map((c) => c.id)));
        setPhase({ kind: 'select', lists: out });
      } catch (e) {
        setPhase({ kind: 'error', text: (e as Error).message || 'Något gick fel.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = async () => {
    try {
      await startMicrosoftAuth();
    } catch (e) {
      setPhase({ kind: 'error', text: (e as Error).message });
    }
  };

  const runImport = (lists: Candidate[]) => {
    const chosen = lists
      .filter((c) => selected.has(c.id))
      .map((c, i) => ({
        name: c.name,
        emoji: c.emoji,
        color: colors[i % colors.length],
        tasks: includeDone ? c.tasks : c.tasks.filter((t) => !t.completed),
      }));
    const result = store.importLists(chosen);
    setPhase({ kind: 'done', ...result });
  };

  return (
    <main className="login import">
      <div className="login-card import-card">
        <header className="import-head">
          <Link to="/" className="icon-btn" aria-label="Tillbaka">
            <ChevronLeft />
          </Link>
          <h1>Importera från Microsoft To Do</h1>
        </header>

        {phase.kind === 'intro' &&
          (msClientId ? (
            <>
              <p>
                Hämta dina listor och uppgifter – med delsteg, förfallodatum, upprepning, stjärnmärkning och anteckningar – från ditt
                Microsoft-konto.
              </p>
              <ul className="import-facts">
                <li>Du loggar in hos Microsoft och godkänner att Bocka får <strong>läsa</strong> dina uppgifter.</li>
                <li>Ingenting ändras eller tas bort i Microsoft To Do.</li>
                <li>Du väljer själv vilka listor som ska följa med.</li>
              </ul>
              <button className="btn btn-provider" onClick={() => void begin()}>
                <MicrosoftLogo />
                <span>Logga in hos Microsoft och hämta listor</span>
              </button>
            </>
          ) : (
            <div className="hint">
              <p>Importen är inte aktiverad ännu. Den som driftar appen behöver:</p>
              <ol>
                <li>
                  I Azure-appregistreringen: lägga till plattformen <strong>Single-page application</strong> med omdirigerings-URI{' '}
                  <code>{importRedirectUri()}</code>
                </li>
                <li>
                  Under <em>API permissions</em>: lägga till <code>Microsoft Graph → Delegated → Tasks.Read</code>
                </li>
                <li>
                  Sätta miljövariabeln <code>VITE_MS_CLIENT_ID</code> till appens Application (client) ID och bygga om.
                </li>
              </ol>
              <p>Se README.md för detaljer.</p>
            </div>
          ))}

        {phase.kind === 'loading' && (
          <div className="import-loading">
            <span className="spinner" aria-hidden />
            <p>{phase.text}</p>
          </div>
        )}

        {phase.kind === 'error' && (
          <>
            <p className="error">{phase.text}</p>
            <button className="btn btn-primary btn-block" onClick={() => setPhase({ kind: 'intro' })}>
              Försök igen
            </button>
          </>
        )}

        {phase.kind === 'select' && (
          <SelectStep
            lists={phase.lists}
            selected={selected}
            setSelected={setSelected}
            includeDone={includeDone}
            setIncludeDone={setIncludeDone}
            onImport={() => runImport(phase.lists)}
          />
        )}

        {phase.kind === 'done' && (
          <>
            <p className="import-done">
              Klart! {phase.lists} {phase.lists === 1 ? 'lista' : 'listor'} och {phase.tasks} {phase.tasks === 1 ? 'uppgift' : 'uppgifter'}{' '}
              har lagts till.
            </p>
            {store.pendingOps > 0 && <p className="hint">Sparar till servern i bakgrunden… ({store.pendingOps} kvar)</p>}
            <p className="hint">Vill du dela en lista med din partner? Öppna listan och tryck på Dela.</p>
            <button className="btn btn-primary btn-block" onClick={() => navigate('/')}>
              Gå till mina listor
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function toCandidate(l: GraphList, tasks: ImportTask[], existing: Set<string>): Candidate {
  const { name, emoji } = listName(l);
  return {
    id: l.id,
    name,
    emoji,
    shared: !!l.isShared,
    flagged: l.wellknownListName === 'flaggedEmails',
    exists: existing.has(name.toLowerCase()),
    tasks,
  };
}

function SelectStep({
  lists,
  selected,
  setSelected,
  includeDone,
  setIncludeDone,
  onImport,
}: {
  lists: Candidate[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  includeDone: boolean;
  setIncludeDone: (v: boolean) => void;
  onImport: () => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const chosen = lists.filter((l) => selected.has(l.id));
  const taskTotal = chosen.reduce((n, l) => n + l.tasks.filter((t) => includeDone || !t.completed).length, 0);
  const anyShared = lists.some((l) => l.shared);

  if (lists.length === 0) return <p>Hittade inga listor i det här Microsoft-kontot.</p>;

  return (
    <>
      <p>Välj vilka listor som ska importeras:</p>
      <ul className="import-lists">
        {lists.map((l) => {
          const open = l.tasks.filter((t) => !t.completed).length;
          const done = l.tasks.length - open;
          return (
            <li key={l.id}>
              <label>
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="grow">
                  <strong>
                    {l.emoji} {l.name}
                  </strong>
                  <span className="muted">
                    {open} {open === 1 ? 'uppgift' : 'uppgifter'}
                    {done > 0 && ` · ${done} slutförda`}
                  </span>
                </span>
                {l.shared && <span className="badge">Delad</span>}
                {l.exists && <span className="badge warn">Finns redan</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <label className="check-row">
        <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
        <span>Ta med slutförda uppgifter</span>
      </label>

      {anyShared && (
        <p className="hint">
          <strong>Delade listor:</strong> importera dem bara hos en av er och dela sedan listan i Bocka – annars får ni dubbletter.
        </p>
      )}
      <p className="hint">"Min dag" och påminnelser följer inte med.</p>

      <button className="btn btn-primary btn-block" disabled={chosen.length === 0} onClick={onImport}>
        Importera {chosen.length} {chosen.length === 1 ? 'lista' : 'listor'} ({taskTotal} uppgifter)
      </button>
    </>
  );
}
