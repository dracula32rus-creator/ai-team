"use client";

import { useEffect, useState } from "react";

interface Task {
  id: number;
  title: string;
  assignee: string;
  controller?: string;
  deadline?: string;
  status: string;
  created_at: string;
}

const STATUS_COLUMNS = [
  { key: "новая", label: "Новые", color: "#3B82F6", emoji: "🆕" },
  { key: "в работе", label: "В работе", color: "#F59E0B", emoji: "🔄" },
  { key: "выполнена", label: "Выполнено", color: "#10B981", emoji: "✅" },
  { key: "просрочена", label: "Просрочено", color: "#EF4444", emoji: "🔴" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchTasks() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setLoading(false);
  }

  async function updateStatus(id: number, status: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTasks();
  }

  const filtered = tasks.filter(t =>
    filter === "" ||
    t.assignee.toLowerCase().includes(filter.toLowerCase()) ||
    t.title.toLowerCase().includes(filter.toLowerCase())
  );

  function isOverdue(task: Task) {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date() && task.status !== "выполнена";
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "без срока";
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f0f0f", color: "#fff" }}>
        Загрузка задач...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", color: "#fff", fontFamily: "sans-serif" }}>
      {/* Шапка */}
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>📋 Задачи команды</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 14 }}>{tasks.length} задач всего</p>
        </div>
        <input
          placeholder="Поиск по имени или задаче..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            background: "#1a1a1a",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "8px 16px",
            color: "#fff",
            fontSize: 14,
            width: 260,
            outline: "none",
          }}
        />
      </div>

      {/* Колонки */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: 24 }}>
        {STATUS_COLUMNS.map(col => {
          const colTasks = filtered.filter(t =>
            col.key === "просрочена"
              ? isOverdue(t)
              : t.status === col.key && !isOverdue(t)
          );

          return (
            <div key={col.key} style={{ background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
              {/* Заголовок колонки */}
              <div style={{
                padding: "12px 16px",
                borderBottom: `2px solid ${col.color}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span>{col.emoji}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{col.label}</span>
                <span style={{
                  marginLeft: "auto",
                  background: col.color + "33",
                  color: col.color,
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 700,
                }}>{colTasks.length}</span>
              </div>

              {/* Карточки */}
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
                {colTasks.length === 0 && (
                  <div style={{ color: "#444", fontSize: 13, textAlign: "center", marginTop: 32 }}>Нет задач</div>
                )}
                {colTasks.map(task => (
                  <div key={task.id} style={{
                    background: "#242424",
                    borderRadius: 8,
                    padding: 12,
                    border: `1px solid ${isOverdue(task) ? "#EF444433" : "#333"}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                      <span style={{ color: "#666", fontSize: 11 }}>#{task.id}</span> {task.title}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#888" }}>
                      <div>👤 {task.assignee}</div>
                      {task.controller && <div>👁 {task.controller}</div>}
                      <div style={{ color: isOverdue(task) ? "#EF4444" : "#888" }}>
                        📅 {formatDate(task.deadline)}
                      </div>
                    </div>

                    {/* Кнопки смены статуса */}
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {STATUS_COLUMNS.filter(s => s.key !== col.key && s.key !== "просрочена").map(s => (
                        <button
                          key={s.key}
                          onClick={() => updateStatus(task.id, s.key)}
                          style={{
                            background: s.color + "22",
                            color: s.color,
                            border: `1px solid ${s.color}44`,
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {s.emoji} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}