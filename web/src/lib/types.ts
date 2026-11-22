export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface List {
  id: string;
  owner_id: string;
  name: string;
  emoji: string | null;
  color: string;
  created_at: string;
  updated_at?: string;
}

export interface Member {
  list_id: string;
  user_id: string;
  role: 'owner' | 'member';
  position: number;
  joined_at?: string;
}

export interface Task {
  id: string;
  list_id: string;
  title: string;
  note: string;
  completed: boolean;
  completed_at: string | null;
  important: boolean;
  due_date: string | null;
  recurrence: Recurrence | null;
  assigned_to: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Step {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface MyDay {
  user_id: string;
  task_id: string;
  day: string;
}

export interface Invitation {
  id: string;
  list_id: string;
  token: string;
  email: string | null;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
}

export interface PendingInvite {
  id: string;
  token: string;
  list_id: string;
  list_name: string;
  list_emoji: string | null;
  inviter_name: string;
  created_at: string;
}

export interface DataState {
  lists: List[];
  members: Member[];
  profiles: Profile[];
  tasks: Task[];
  steps: Step[];
  myDay: MyDay[];
  invitations: Invitation[];
  pending: PendingInvite[];
}

export const emptyState: DataState = {
  lists: [],
  members: [],
  profiles: [],
  tasks: [],
  steps: [],
  myDay: [],
  invitations: [],
  pending: [],
};

/** Tabeller som kan ändras via kön (offline-stöd) */
export type TableName = 'lists' | 'list_members' | 'tasks' | 'steps' | 'my_day';

export interface Op {
  id: string;
  table: TableName;
  action: 'insert' | 'update' | 'delete';
  match: Record<string, string>;
  /** Vid insert kan flera rader skickas i ett anrop */
  values?: Record<string, unknown> | Record<string, unknown>[];
}

export type SmartView = 'myday' | 'important' | 'planned' | 'assigned';
