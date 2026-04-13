import { useState, useEffect, useCallback } from "react";
import {
  Check, Circle, Plus, Trash2, ChevronDown, ChevronRight,
  ListTodo, Calendar as CalendarIcon, FileText, X, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { translations, type Language } from "../../translations";
import type { AccountSummary } from "../../types";
import type { TaskList, Task } from "../../services/tasks";

interface TasksViewProps {
  taskLists: (TaskList & { accountEmail: string; accountColor: string })[];
  tasks: Task[];
  loading: boolean;
  isDemo: boolean;
  lang: Language;
  accounts: AccountSummary[];
  onToggleTask: (listId: string, taskId: string, completed: boolean) => void;
  onCreateTask: (listId: string, task: { title: string; notes?: string; due?: string }) => void;
  onDeleteTask: (listId: string, taskId: string) => void;
  onCreateList: (title: string, accountEmail?: string) => void;
  onDeleteList: (listId: string) => void;
  onClearCompleted: (listId: string) => void;
  onRefresh: () => void;
}

export default function TasksView({
  taskLists, tasks, loading, isDemo, lang, accounts,
  onToggleTask, onCreateTask, onDeleteTask, onCreateList, onDeleteList, onClearCompleted, onRefresh,
}: TasksViewProps) {
  const t = translations[lang];

  // ── State ──
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDue, setNewDue] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListAccount, setNewListAccount] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Set first list as active if none selected
  const selectedListId = activeListId || taskLists[0]?.id || null;

  // Filter tasks for active list (by listId if available, fallback to list id match)
  const listTasks = tasks.filter(t => {
    if (!selectedListId) return false;
    return t.listId === selectedListId;
  });

  // Split into top-level tasks vs subtasks
  const topLevelTasks = listTasks.filter(t => !t.parent);
  const subtasksMap = new Map<string, Task[]>();
  for (const t of listTasks) {
    if (t.parent) {
      const subs = subtasksMap.get(t.parent) || [];
      subs.push(t);
      subtasksMap.set(t.parent, subs);
    }
  }

  const pendingTasks = topLevelTasks.filter(t => t.status === "needsAction");
  const completedTasks = topLevelTasks.filter(t => t.status === "completed");

  // ── Create Task ──
  const handleAddTask = useCallback(() => {
    if (!newTitle.trim() || !selectedListId) return;
    onCreateTask(selectedListId, {
      title: newTitle.trim(),
      notes: newNotes.trim() || undefined,
      due: newDue ? `${newDue}T00:00:00.000Z` : undefined,
    });
    setNewTitle("");
    setNewNotes("");
    setNewDue("");
    setShowNewTask(false);
  }, [newTitle, newNotes, newDue, selectedListId, onCreateTask]);

  // ── Create List ──
  const handleAddList = useCallback(() => {
    if (!newListTitle.trim()) return;
    onCreateList(newListTitle.trim(), newListAccount || undefined);
    setNewListTitle("");
    setNewListAccount("");
    setShowNewList(false);
  }, [newListTitle, newListAccount, onCreateList]);

  const selectedList = taskLists.find(l => l.id === selectedListId);

  // ── Render Task Item ──
  const renderTask = (task: Task, isSubtask = false) => {
    const isCompleted = task.status === "completed";
    const isExpanded = expandedTask === task.id;
    const subs = subtasksMap.get(task.id) || [];
    const hasDue = task.due && !isCompleted;
    const dueDate = task.due ? new Date(task.due) : null;
    const isOverdue = dueDate && dueDate < new Date() && !isCompleted;

    return (
      <div key={task.id} className={isSubtask ? "ml-8" : ""}>
        <div className={`group flex items-start gap-3 py-2.5 px-3 rounded-[4px] t-transition hover:bg-[var(--bg-alt)] ${isCompleted ? "opacity-50" : ""}`}>
          {/* Toggle circle */}
          <button
            onClick={() => onToggleTask(selectedListId!, task.id, isCompleted)}
            className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center t-transition ${
              isCompleted
                ? "bg-[var(--blue)] border-[var(--blue)] text-white"
                : "border-[var(--border)] hover:border-[var(--blue)]"
            }`}
          >
            {isCompleted && <Check className="size-3" />}
          </button>

          {/* Content */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => setExpandedTask(isExpanded ? null : task.id)}
          >
            <p className={`text-sm ${isCompleted ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
              {task.title}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {hasDue && (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? "text-red-500" : "text-[var(--text-tertiary)]"}`}>
                  <CalendarIcon className="size-3" />
                  {dueDate!.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              {task.updated && isExpanded && (
                <span className="text-[10px] text-[var(--text-quaternary)] flex items-center gap-0.5">
                  <Clock className="size-2.5" />
                  {new Date(task.updated).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              {isCompleted && task.completed && isExpanded && (
                <span className="text-[10px] text-emerald-500 flex items-center gap-0.5">
                  <Check className="size-2.5" />
                  {new Date(task.completed).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {task.notes && isExpanded && (
              <p className="text-xs text-[var(--text-tertiary)] mt-1.5 whitespace-pre-wrap leading-relaxed">
                {task.notes}
              </p>
            )}
          </div>

          {/* Notes indicator */}
          {task.notes && !isExpanded && (
            <FileText className="size-3.5 text-[var(--text-quaternary)] mt-0.5 flex-shrink-0" />
          )}

          {/* Delete */}
          <button
            onClick={() => onDeleteTask(selectedListId!, task.id)}
            className="opacity-0 group-hover:opacity-100 mt-0.5 text-[var(--text-quaternary)] hover:text-red-500 t-transition flex-shrink-0"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {/* Subtasks */}
        {subs.map(sub => renderTask(sub, true))}
      </div>
    );
  };

  return (
    <div className="h-full flex">
      {/* ── Desktop Sidebar: Task Lists ── */}
      {!isMobile && (
        <div className="w-[220px] lg:w-[260px] border-r border-[var(--border-light)] flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-3 py-3 border-b border-[var(--border-light)]">
            <h2 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
              {t.taskLists}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {taskLists.map(list => {
              const pendingCount = tasks.filter(t => t.listId === list.id && t.status === "needsAction").length;
              return (
                <button
                  key={list.id}
                  onClick={() => setActiveListId(list.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left t-transition ${
                    selectedListId === list.id
                      ? "bg-[var(--blue-light)] text-[var(--blue)] font-medium"
                      : "text-[var(--text-body)] hover:bg-[var(--bg-alt)]"
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: list.accountColor }}
                    title={list.accountEmail}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{list.title}</span>
                    {accounts.length > 1 && (
                      <span className="text-[10px] text-[var(--text-quaternary)] truncate block">
                        {list.accountEmail}
                      </span>
                    )}
                  </div>
                  {pendingCount > 0 && (
                    <span className="ml-auto text-xs text-[var(--text-quaternary)] flex-shrink-0">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Add List */}
          <div className="border-t border-[var(--border-light)] p-2">
            {showNewList ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={newListTitle}
                    onChange={e => setNewListTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddList(); if (e.key === "Escape") setShowNewList(false); }}
                    placeholder={t.newList}
                    className="flex-1 h-8 px-2 text-sm bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none focus:border-[var(--blue)]"
                  />
                  <button onClick={handleAddList} className="h-8 px-2 text-sm text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition">
                    {t.addList}
                  </button>
                </div>
                {accounts.length > 1 && (
                  <select
                    value={newListAccount}
                    onChange={e => setNewListAccount(e.target.value)}
                    className="w-full h-7 px-2 text-xs bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-body)]"
                  >
                    <option value="">{t.allAccounts}</option>
                    {accounts.map(a => (
                      <option key={a.email} value={a.email}>{a.name} ({a.email})</option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowNewList(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
              >
                <Plus className="size-4" />
                {t.newList}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Main: Task Items ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedList ? (
          <>
            {/* Mobile: list selector dropdown */}
            {isMobile && (
              <div className="px-3 py-2 border-b border-[var(--border-light)]">
                <select
                  value={selectedListId || ""}
                  onChange={e => setActiveListId(e.target.value)}
                  className="w-full h-9 px-2 text-sm bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-primary)] t-transition"
                >
                  {taskLists.map(list => (
                    <option key={list.id} value={list.id}>{list.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* List header */}
            <div className="px-4 py-3 border-b border-[var(--border-light)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4 text-[var(--blue)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">{selectedList.title}</h2>
                <span className="text-xs text-[var(--text-quaternary)]">
                  {pendingTasks.length} {t.tasks.toLowerCase()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {completedTasks.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm(t.clearCompletedConfirm)) onClearCompleted(selectedListId!);
                    }}
                    className="px-2.5 py-1 text-xs text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-[4px] t-transition"
                  >
                    {t.clearCompleted}
                  </button>
                )}
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {/* Add task inline */}
              {showNewTask ? (
                <div className="mb-3 p-3 border border-[var(--border-light)] rounded-[4px] bg-[var(--bg)]">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddTask(); } if (e.key === "Escape") setShowNewTask(false); }}
                    placeholder={t.taskTitle}
                    className="w-full text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none"
                  />
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder={t.taskNotes}
                    rows={2}
                    className="w-full mt-2 text-xs bg-transparent text-[var(--text-body)] placeholder:text-[var(--text-quaternary)] focus:outline-none resize-none"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="date"
                      value={newDue}
                      onChange={e => setNewDue(e.target.value)}
                      className="h-7 px-2 text-xs bg-transparent border border-[var(--border-light)] rounded-[4px] text-[var(--text-body)]"
                    />
                    <div className="flex-1" />
                    <button
                      onClick={() => setShowNewTask(false)}
                      className="px-2.5 py-1 text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-alt)] rounded-[4px] t-transition"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={handleAddTask}
                      disabled={!newTitle.trim()}
                      className="px-3 py-1 text-xs text-white bg-[var(--blue)] hover:bg-[var(--blue-hover)] rounded-[4px] t-btn-transition disabled:opacity-40"
                    >
                      {t.addTask}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewTask(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 text-sm text-[var(--blue)] hover:bg-[var(--blue-light)] rounded-[4px] t-transition"
                >
                  <Plus className="size-4" />
                  {t.addTask}
                </button>
              )}

              {/* Pending tasks */}
              {pendingTasks.length === 0 && completedTasks.length === 0 && !showNewTask && (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--text-quaternary)]">
                  <ListTodo className="size-10 mb-3 opacity-20" />
                  <p className="text-sm">{t.noTasks}</p>
                </div>
              )}

              {pendingTasks.map(task => renderTask(task))}

              {/* Completed section */}
              {completedTasks.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-body)] t-transition"
                  >
                    {showCompleted ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    {t.completedTasks} ({completedTasks.length})
                  </button>
                  {showCompleted && completedTasks.map(task => renderTask(task))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--text-quaternary)]">
            <div className="text-center">
              <ListTodo className="size-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t.noTasks}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
