import { useEffect, useRef, useState } from 'react';
import { addDays, formatDue, isoDate, nextWeekday } from '../lib/dates';
import { isInMyDay, isShared, membersOf, myLists, profileName } from '../lib/selectors';
import type { Recurrence } from '../lib/types';
import { useStore } from '../store';
import { CalendarIcon, CheckIcon, ChevronLeft, MoveIcon, PlusIcon, RepeatIcon, StarIcon, SunIcon, TrashIcon, UserIcon, XIcon } from './Icons';
import { Avatar } from './ui';

const recurrenceLabels: Record<Recurrence, string> = {
  daily: 'Varje dag',
  weekdays: 'Vardagar',
  weekly: 'Varje vecka',
  monthly: 'Varje månad',
  yearly: 'Varje år',
};

/** Textfält som sparar när man lämnar det (inte vid varje tangenttryck) */
function useDraft(value: string, save: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);
  // Spara även om vyn stängs medan man skriver (t.ex. bakåtknappen på mobilen)
  const latest = useRef({ draft, value, save });
  latest.current = { draft, value, save };
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.draft !== l.value) l.save(l.draft);
    },
    [],
  );
  return {
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      if (draft !== value) save(draft);
    },
  };
}

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const store = useStore();
  const { data, user } = store;
  const task = data.tasks.find((t) => t.id === taskId);
  const [newStep, setNewStep] = useState('');
  const today = isoDate();

  const title = useDraft(task?.title ?? '', (v) => {
    if (task && v.trim()) store.updateTask(task.id, { title: v.trim() });
  });
  const note = useDraft(task?.note ?? '', (v) => task && store.updateTask(task.id, { note: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!task) {
    return (
      <aside className="detail">
        <div className="detail-head">
          <button className="icon-btn" onClick={onClose} aria-label="Stäng">
            <XIcon />
          </button>
        </div>
        <p className="empty-state">Uppgiften finns inte längre.</p>
      </aside>
    );
  }

  const steps = data.steps.filter((s) => s.task_id === task.id).sort((a, b) => a.position - b.position);
  const inMyDay = isInMyDay(data, user.id, task.id, today);
  const lists = myLists(data, user.id);
  const list = data.lists.find((l) => l.id === task.list_id);
  const shared = isShared(data, task.list_id);
  const members = membersOf(data, task.list_id);
  const creator = data.profiles.find((p) => p.id === task.created_by);

  const remove = () => {
    const snapshotSteps = steps;
    store.deleteTask(task.id);
    onClose();
    store.toast(`"${task.title}" togs bort`, { label: 'Ångra', run: () => store.restoreTask(task, snapshotSteps) });
  };

  return (
    <aside className="detail" aria-label="Uppgiftsdetaljer">
      <div className="detail-head">
        <button className="icon-btn back-detail" onClick={onClose} aria-label="Tillbaka">
          <ChevronLeft />
        </button>
        <span className="detail-list">
          {list?.emoji} {list?.name}
        </span>
        <button className="icon-btn close-detail" onClick={onClose} aria-label="Stäng">
          <XIcon />
        </button>
      </div>

      <div className="detail-scroll">
        <div className="card detail-title-card">
          <div className="detail-title-row">
            <button
              className={'check' + (task.completed ? ' on' : '')}
              onClick={() => store.updateTask(task.id, { completed: !task.completed })}
              aria-label={task.completed ? 'Markera som ej klar' : 'Bocka av'}
              aria-pressed={task.completed}
            >
              <CheckIcon size={14} />
            </button>
            <textarea
              className={'detail-title' + (task.completed ? ' done' : '')}
              rows={1}
              maxLength={1000}
              {...title}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              aria-label="Titel"
            />
            <button
              className={'star' + (task.important ? ' on' : '')}
              onClick={() => store.updateTask(task.id, { important: !task.important })}
              aria-label={task.important ? 'Ta bort som viktig' : 'Markera som viktig'}
              aria-pressed={task.important}
            >
              <StarIcon size={20} filled={task.important} />
            </button>
          </div>

          <ul className="steps">
            {steps.map((s) => (
              <li key={s.id} className={'step' + (s.completed ? ' done' : '')}>
                <button
                  className={'check small' + (s.completed ? ' on' : '')}
                  onClick={() => store.updateStep(s.id, { completed: !s.completed })}
                  aria-label={s.completed ? 'Markera steg som ej klart' : 'Bocka av steg'}
                >
                  <CheckIcon size={11} />
                </button>
                <StepTitle value={s.title} onSave={(v) => store.updateStep(s.id, { title: v })} />
                <button className="icon-btn subtle" onClick={() => store.deleteStep(s.id)} aria-label="Ta bort steg">
                  <XIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="add-step"
            onSubmit={(e) => {
              e.preventDefault();
              if (newStep.trim()) store.addStep(task.id, newStep);
              setNewStep('');
            }}
          >
            <PlusIcon size={18} />
            <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={steps.length ? 'Nästa steg' : 'Lägg till steg'} maxLength={1000} />
          </form>
        </div>

        <div className="card">
          <button className={'row-btn' + (inMyDay ? ' active' : '')} onClick={() => store.setMyDay(task.id, !inMyDay)}>
            <SunIcon />
            <span>{inMyDay ? 'Tillagd i Min dag' : 'Lägg till i Min dag'}</span>
            {inMyDay && <XIcon size={16} className="trail" />}
          </button>
        </div>

        <div className="card">
          <div className={'row-field' + (task.due_date ? ' active' : '')}>
            <CalendarIcon />
            <div className="grow">
              <span>{task.due_date ? `Förfaller ${formatDue(task.due_date, today).toLowerCase()}` : 'Lägg till förfallodatum'}</span>
              <div className="chips">
                <button className="chip" onClick={() => store.updateTask(task.id, { due_date: today })}>
                  Idag
                </button>
                <button className="chip" onClick={() => store.updateTask(task.id, { due_date: addDays(today, 1) })}>
                  Imorgon
                </button>
                <button className="chip" onClick={() => store.updateTask(task.id, { due_date: nextWeekday(today, 1) })}>
                  Nästa vecka
                </button>
                <label className="chip date-chip">
                  Välj datum
                  <input
                    type="date"
                    value={task.due_date ?? ''}
                    onChange={(e) => store.updateTask(task.id, { due_date: e.target.value || null })}
                  />
                </label>
              </div>
            </div>
            {task.due_date && (
              <button className="icon-btn subtle" onClick={() => store.updateTask(task.id, { due_date: null, recurrence: null })} aria-label="Ta bort förfallodatum">
                <XIcon size={16} />
              </button>
            )}
          </div>
          <label className={'row-field' + (task.recurrence ? ' active' : '')}>
            <RepeatIcon />
            <select
              className="grow plain-select"
              value={task.recurrence ?? ''}
              onChange={(e) => {
                const r = (e.target.value || null) as Recurrence | null;
                store.updateTask(task.id, { recurrence: r, ...(r && !task.due_date ? { due_date: today } : {}) });
              }}
            >
              <option value="">Upprepa inte</option>
              {(Object.keys(recurrenceLabels) as Recurrence[]).map((r) => (
                <option key={r} value={r}>
                  Upprepa: {recurrenceLabels[r]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {shared && (
          <div className="card">
            <label className={'row-field' + (task.assigned_to ? ' active' : '')}>
              {task.assigned_to ? <Avatar profile={data.profiles.find((p) => p.id === task.assigned_to)} size={22} /> : <UserIcon />}
              <select
                className="grow plain-select"
                value={task.assigned_to ?? ''}
                onChange={(e) => store.updateTask(task.id, { assigned_to: e.target.value || null })}
              >
                <option value="">Tilldela till…</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === user.id ? 'Mig' : profileName(data.profiles.find((p) => p.id === m.user_id))}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {lists.length > 1 && (
          <div className="card">
            <label className="row-field">
              <MoveIcon />
              <select
                className="grow plain-select"
                value={task.list_id}
                onChange={(e) => store.updateTask(task.id, { list_id: e.target.value })}
                aria-label="Flytta till lista"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id === task.list_id ? 'Lista: ' : 'Flytta till: '}
                    {l.emoji} {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="card">
          <textarea className="note" placeholder="Lägg till anteckning" rows={4} maxLength={20000} {...note} aria-label="Anteckning" />
        </div>
      </div>

      <footer className="detail-foot">
        <span>
          {task.completed && task.completed_at
            ? `Slutförd ${new Date(task.completed_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`
            : `Skapad ${new Date(task.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}`}
          {shared && creator ? ` av ${creator.id === user.id ? 'dig' : profileName(creator)}` : ''}
        </span>
        <button className="icon-btn danger" onClick={remove} aria-label="Ta bort uppgift">
          <TrashIcon />
        </button>
      </footer>
    </aside>
  );
}

function StepTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const d = useDraft(value, (v) => v.trim() && onSave(v.trim()));
  return (
    <input
      className="step-title"
      {...d}
      maxLength={1000}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Steg"
    />
  );
}
