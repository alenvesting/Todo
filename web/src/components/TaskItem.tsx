import { memo, useState } from 'react';
import { formatDue, isoDate } from '../lib/dates';
import { isInMyDay } from '../lib/selectors';
import type { Task } from '../lib/types';
import { useStore } from '../store';
import { CalendarIcon, CheckIcon, NoteIcon, RepeatIcon, StarIcon, SunIcon } from './Icons';
import { Avatar } from './ui';

function TaskItemInner({
  task,
  showList,
  hideMyDay,
  selected,
  onOpen,
}: {
  task: Task;
  showList?: boolean;
  hideMyDay?: boolean;
  selected?: boolean;
  onOpen: (id: string) => void;
}) {
  const { data, user, updateTask } = useStore();
  const [popping, setPopping] = useState(false);
  const today = isoDate();
  const steps = data.steps.filter((s) => s.task_id === task.id);
  const doneSteps = steps.filter((s) => s.completed).length;
  const list = showList ? data.lists.find((l) => l.id === task.list_id) : undefined;
  const assignee = task.assigned_to ? data.profiles.find((p) => p.id === task.assigned_to) : undefined;
  const inMyDay = !hideMyDay && isInMyDay(data, user.id, task.id, today);
  const overdue = !task.completed && task.due_date && task.due_date < today;

  const meta: JSX.Element[] = [];
  if (inMyDay)
    meta.push(
      <span key="md" className="meta">
        <SunIcon size={13} /> Min dag
      </span>,
    );
  if (list)
    meta.push(
      <span key="l" className="meta">
        {list.emoji} {list.name}
      </span>,
    );
  if (steps.length)
    meta.push(
      <span key="s" className="meta">
        {doneSteps} av {steps.length}
      </span>,
    );
  if (task.due_date)
    meta.push(
      <span key="d" className={'meta' + (overdue ? ' overdue' : task.due_date === today && !task.completed ? ' today' : '')}>
        <CalendarIcon size={13} /> {formatDue(task.due_date, today)}
        {task.recurrence && <RepeatIcon size={13} />}
      </span>,
    );
  else if (task.recurrence)
    meta.push(
      <span key="r" className="meta">
        <RepeatIcon size={13} />
      </span>,
    );
  if (task.note.trim())
    meta.push(
      <span key="n" className="meta">
        <NoteIcon size={13} /> Anteckning
      </span>,
    );

  const toggle = () => {
    if (!task.completed) {
      setPopping(true);
      setTimeout(() => setPopping(false), 400);
    }
    updateTask(task.id, { completed: !task.completed });
  };

  return (
    <li className={'task' + (task.completed ? ' done' : '') + (selected ? ' selected' : '')}>
      <button
        className={'check' + (task.completed ? ' on' : '') + (popping ? ' pop' : '')}
        onClick={toggle}
        aria-label={task.completed ? `Markera ${task.title} som ej klar` : `Bocka av ${task.title}`}
        aria-pressed={task.completed}
      >
        <CheckIcon size={14} />
      </button>
      <button className="task-main" onClick={() => onOpen(task.id)}>
        <span className="task-title">{task.title}</span>
        {meta.length > 0 && (
          <span className="task-meta">
            {meta.map((m, i) => (
              <span key={m.key} className="meta-wrap">
                {i > 0 && <span className="dot">•</span>}
                {m}
              </span>
            ))}
          </span>
        )}
      </button>
      {assignee && <Avatar profile={assignee} size={24} />}
      <button
        className={'star' + (task.important ? ' on' : '')}
        onClick={() => updateTask(task.id, { important: !task.important })}
        aria-label={task.important ? 'Ta bort som viktig' : 'Markera som viktig'}
        aria-pressed={task.important}
      >
        <StarIcon size={20} filled={task.important} />
      </button>
    </li>
  );
}

export const TaskItem = memo(TaskItemInner);
