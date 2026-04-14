/**
 * Google Tasks API v1 — direct browser REST calls.
 */
import { googleFetch } from './apiHelpers';
import { TASKS_API } from '../config';
import type { StoredAccount } from '../types';

// ── Types ─────────────────────────────────────────────────────

export interface TaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;           // RFC 3339
  completed?: string;     // RFC 3339
  parent?: string;
  position?: string;
  hidden?: boolean;
  deleted?: boolean;
  updated?: string;
  // Multi-account tracking (added client-side)
  accountEmail?: string;
  accountColor?: string;
  listId?: string;
}

// ── Task Lists ────────────────────────────────────────────────

export async function listTaskLists(
  token: string,
  signal?: AbortSignal,
): Promise<TaskList[]> {
  const data = await googleFetch<{ items?: TaskList[] }>(
    `${TASKS_API}/users/@me/lists?maxResults=100`,
    token,
    signal ? { signal } : {},
  );
  return data.items || [];
}

export async function createTaskList(
  token: string,
  title: string,
): Promise<TaskList> {
  return googleFetch<TaskList>(
    `${TASKS_API}/users/@me/lists`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
  );
}

export async function deleteTaskList(
  token: string,
  listId: string,
): Promise<void> {
  await googleFetch<void>(
    `${TASKS_API}/users/@me/lists/${listId}`,
    token,
    { method: 'DELETE' },
  );
}

// ── Tasks ─────────────────────────────────────────────────────

export async function listTasks(
  token: string,
  listId: string,
  params?: {
    showCompleted?: boolean;
    showHidden?: boolean;
    maxResults?: number;
    pageToken?: string;
    signal?: AbortSignal;
  },
): Promise<{ items: Task[]; nextPageToken?: string }> {
  const sp = new URLSearchParams();
  sp.set('maxResults', String(params?.maxResults ?? 100));
  if (params?.showCompleted !== undefined) sp.set('showCompleted', String(params.showCompleted));
  if (params?.showHidden !== undefined) sp.set('showHidden', String(params.showHidden));
  if (params?.pageToken) sp.set('pageToken', params.pageToken);

  const data = await googleFetch<{ items?: Task[]; nextPageToken?: string }>(
    `${TASKS_API}/lists/${listId}/tasks?${sp}`,
    token,
    params?.signal ? { signal: params.signal } : {},
  );
  return { items: data.items || [], nextPageToken: data.nextPageToken };
}

export async function createTask(
  token: string,
  listId: string,
  task: { title: string; notes?: string; due?: string; parent?: string },
): Promise<Task> {
  const sp = new URLSearchParams();
  if (task.parent) sp.set('parent', task.parent);

  const body: Record<string, string> = { title: task.title };
  if (task.notes) body.notes = task.notes;
  if (task.due) body.due = task.due;

  return googleFetch<Task>(
    `${TASKS_API}/lists/${listId}/tasks${sp.toString() ? `?${sp}` : ''}`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export async function updateTask(
  token: string,
  listId: string,
  taskId: string,
  patch: Partial<Pick<Task, 'title' | 'notes' | 'status' | 'due' | 'completed'>>,
): Promise<Task> {
  return googleFetch<Task>(
    `${TASKS_API}/lists/${listId}/tasks/${taskId}`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}

export async function deleteTask(
  token: string,
  listId: string,
  taskId: string,
): Promise<void> {
  await googleFetch<void>(
    `${TASKS_API}/lists/${listId}/tasks/${taskId}`,
    token,
    { method: 'DELETE' },
  );
}

export async function moveTask(
  token: string,
  listId: string,
  taskId: string,
  opts?: { parent?: string; previous?: string },
): Promise<Task> {
  const sp = new URLSearchParams();
  if (opts?.parent) sp.set('parent', opts.parent);
  if (opts?.previous) sp.set('previous', opts.previous);
  return googleFetch<Task>(
    `${TASKS_API}/lists/${listId}/tasks/${taskId}/move${sp.toString() ? `?${sp}` : ''}`,
    token,
    { method: 'POST' },
  );
}

export async function clearCompleted(
  token: string,
  listId: string,
): Promise<void> {
  await googleFetch<void>(
    `${TASKS_API}/lists/${listId}/clear`,
    token,
    { method: 'POST' },
  );
}

// ── Multi-account helpers ─────────────────────────────────────

/**
 * Fetch task lists + tasks from all valid accounts.
 */
export async function fetchAllAccountTasks(
  accounts: StoredAccount[],
  opts?: {
    accountFilter?: string;
    showCompleted?: boolean;
    signal?: AbortSignal;
  },
): Promise<{
  taskLists: (TaskList & { accountEmail: string; accountColor: string })[];
  tasks: Task[];
}> {
  const filtered = opts?.accountFilter
    ? accounts.filter(a => a.email === opts.accountFilter)
    : accounts;

  const allLists: (TaskList & { accountEmail: string; accountColor: string })[] = [];
  const allTasks: Task[] = [];

  await Promise.all(
    filtered.map(async (account) => {
      try {
        const lists = await listTaskLists(account.access_token, opts?.signal);

        for (const list of lists) {
          allLists.push({ ...list, accountEmail: account.email, accountColor: account.color });
        }

        // Fetch tasks for all lists in parallel
        await Promise.all(lists.map(async (list) => {
          // Paginate to get all tasks (API returns max 100 per page)
          let pageToken: string | undefined;
          do {
            const result = await listTasks(account.access_token, list.id, {
              showCompleted: opts?.showCompleted ?? true,
              pageToken,
              signal: opts?.signal,
            });

            for (const task of result.items) {
              allTasks.push({
                ...task,
                accountEmail: account.email,
                accountColor: account.color,
                listId: list.id,
              });
            }

            pageToken = result.nextPageToken;
          } while (pageToken);
        }));
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error(`Tasks fetch error for ${account.email}:`, e);
        }
      }
    }),
  );

  return { taskLists: allLists, tasks: allTasks };
}
