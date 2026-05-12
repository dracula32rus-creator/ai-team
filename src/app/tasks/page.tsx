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

interface Member {
  name: string;
  username: string;
  role: string;
  subrole: string;
  color: string;
  accent: string;
  bg: string;
  avatar: string;
}

const TEAM: Member[] = [
  {
    name: "Сергей", username: "pivensa",
    role: "Генеральный директор", subrole: "Стратегия · Управление · Решения",
    color: "#C9A84C", accent: "#FFD700",
    bg: "linear-gradient(135deg, #1a1400 0%, #2a2000 100%)",
    avatar: "/avatars/sergey.jpg",
  },
  {
    name: "Кирилл", username: "eviiilzues",
    role: "Помощник CEO · Байер · Логистика", subrole: "Китай · Оплаты · Контроль",
    color: "#9B1B30", accent: "#C4374F",
    bg: "linear-gradient(135deg, #120006 0%, #200010 100%)",
    avatar: "/avatars/kirill.jpg",
  },
  {
    name: "Надя", username: "nadibozhenova",
    role: "Менеджер Wildberries", subrole: "Продажи · Карточки · Аналитика WB",
    color: "#7B2FBE", accent: "#A855F7",
    bg: "linear-gradient(135deg, #0d0014 0%, #1a0029 100%)",
    avatar: "/avatars/nadya.jpg",
  },
  {
    name: "Рита", username: "margarita030587",
    role: "Менеджер Ozon", subrole: "Продажи · Карточки · Аналитика Ozon",
    color: "#0099CC", accent: "#33BBEE",
    bg: "linear-gradient(135deg, #000d1a 0%, #001829 100%)",
    avatar: "/avatars/rita.jpg",
  },
  {
    name: "Вадим", username: "vadimcheggg",
    role: "Складской менеджер", subrole: "Хранение · Упаковка · Отгрузки",
    color: "#00C896", accent: "#4DFFCC",
    bg: "linear-gradient(135deg, #001a12 0%, #00291e 100%)",
    avatar: "/avatars/vadim.jpg",
  },
  {
    name: "Настя", username: "ssidaan",
    role: "Маркетолог", subrole: "Реклама · Бартеры · Блогеры",
    color: "#FF3D8A", accent: "#FF80B4",
    bg: "linear-gradient(135deg, #1a0010 0%, #29001a 100%)",
    avatar: "/avatars/nastya.jpg",
  },
];

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
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    const ti = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(ti); };
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

  function isOverdue(task: Task) {
    if (!task.deadline) return false;
    return new Date(task.deadline) < new Date() && task.status !== "выполнена";
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return "без срока";
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  }

  const filtered = tasks.filter(t => {
    const matchFilter = filter === "" ||
      t.assignee.toLowerCase().includes(filter.toLowerCase()) ||
      t.title.toLowerCase().includes(filter.toLowerCase());
    const matchMember = selectedMember === null || t.assignee === selectedMember;
    return matchFilter && matchMember;
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "выполнена").length;
  const overdueTasks = tasks.filter(t => isOverdue(t)).length;
  const activeTasks = tasks.filter(t => t.status !== "выполнена").length;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#060606", color: "#fff" }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#060606", color: "#fff", fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>

      {/* Шапка */}
      <div style={{
        padding: "24px 40px", borderBottom: "1px solid #ffffff0a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50, background: "#06060699",
        backdropFilter: "blur(20px)",
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🏢 Командный центр</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>AI Team · WB & Ozon</div>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[
            { label: "Всего", value: totalTasks, color: "#888" },
            { label: "Активных", value: activeTasks, color: "#5B8CFF" },
            { label: "Выполнено", value: doneTasks, color: "#00C896" },
            { label: "Просрочено", value: overdueTasks, color: overdueTasks > 0 ? "#FF4444" : "#444" },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{stat.label}</div>
            </div>
          ))}
          <div style={{ background: "#ffffff08", border: "1px solid #ffffff11", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#888" }}>
            {time.toLocaleTimeString("ru-RU")}
          </div>
        </div>
      </div>

      {/* Карточки сотрудников */}
      <div style={{ padding: "24px 40px 0" }}>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
          Фильтр по сотруднику — {selectedMember ? `показаны задачи: ${selectedMember}` : "все задачи"}
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          <div
            onClick={() => setSelectedMember(null)}
            style={{
              flexShrink: 0, padding: "8px 16px", borderRadius: 10, cursor: "pointer",
              background: selectedMember === null ? "#ffffff22" : "#ffffff08",
              border: selectedMember === null ? "1px solid #ffffff44" : "1px solid #ffffff11",
              fontSize: 13, color: selectedMember === null ? "#fff" : "#666",
              transition: "all 0.2s",
            }}
          >
            Все
          </div>
          {TEAM.map(member => {
            const memberTasks = tasks.filter(t => t.assignee === member.name);
            const active = memberTasks.filter(t => t.status !== "выполнена").length;
            const isSelected = selectedMember === member.name;

            return (
              <div
                key={member.username}
                onClick={() => setSelectedMember(isSelected ? null : member.name)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", borderRadius: 12, cursor: "pointer",
                  background: isSelected ? member.bg : "#ffffff05",
                  border: isSelected ? `1px solid ${member.color}66` : "1px solid #ffffff0a",
                  transition: "all 0.2s",
                  boxShadow: isSelected ? `0 4px 20px ${member.color}22` : "none",
                }}
              >
                <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
                  {isSelected && [0].map(i => (
                    <div key={i} style={{
                      position: "absolute", inset: i * 4, borderRadius: "50%",
                      border: `1.5px solid ${member.color}`,
                      opacity: 0.5, animation: `pulse 2s ease-out infinite`,
                    }} />
                  ))}
                  <img
                    src={member.avatar}
                    alt={member.name}
                    style={{
                      position: "absolute", inset: isSelected ? 4 : 0,
                      borderRadius: "50%", width: isSelected ? "calc(100% - 8px)" : "100%",
                      height: isSelected ? "calc(100% - 8px)" : "100%",
                      objectFit: "cover",
                      border: `2px solid ${isSelected ? member.color : "#ffffff22"}`,
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#fff" : "#aaa" }}>
                    {member.name}
                  </div>
                  <div style={{ fontSize: 10, color: isSelected ? member.color : "#555" }}>
                    {active} активных
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Поиск */}
      <div style={{ padding: "16px 40px" }}>
        <input
          placeholder="Поиск по задаче..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 8,
            padding: "8px 16px", color: "#fff", fontSize: 14, width: 300, outline: "none",
          }}
        />
      </div>

      {/* Доска задач */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "0 40px 40px" }}>
        {STATUS_COLUMNS.map(col => {
          const colTasks = filtered.filter(t =>
            col.key === "просрочена" ? isOverdue(t) : t.status === col.key && !isOverdue(t)
          );

          return (
            <div key={col.key} style={{ background: "#111", borderRadius: 12, overflow: "hidden" }}>
              <div style={{
                padding: "12px 16px", borderBottom: `2px solid ${col.color}`,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>{col.emoji}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{col.label}</span>
                <span style={{
                  marginLeft: "auto", background: col.color + "33", color: col.color,
                  borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 700,
                }}>{colTasks.length}</span>
              </div>

              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
                {colTasks.length === 0 && (
                  <div style={{ color: "#333", fontSize: 13, textAlign: "center", marginTop: 32 }}>Нет задач</div>
                )}
                {colTasks.map(task => {
                  const member = TEAM.find(m => m.name === task.assignee);
                  return (
                    <div key={task.id} style={{
                      background: "#1a1a1a", borderRadius: 8, padding: 12,
                      border: `1px solid ${isOverdue(task) ? "#EF444433" : member ? member.color + "22" : "#333"}`,
                      borderLeft: `3px solid ${member ? member.color : "#444"}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                        <span style={{ color: "#555", fontSize: 11 }}>#{task.id}</span> {task.title}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {member && (
                          <img src={member.avatar} alt={member.name} style={{
                            width: 20, height: 20, borderRadius: "50%", objectFit: "cover",
                            border: `1px solid ${member.color}`,
                          }} />
                        )}
                        <span style={{ fontSize: 12, color: member ? member.color : "#888" }}>
                          {task.assignee}
                        </span>
                      </div>

                      <div style={{ fontSize: 11, color: isOverdue(task) ? "#EF4444" : "#666", marginBottom: 8 }}>
                        📅 {formatDate(task.deadline)}
                      </div>

                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {STATUS_COLUMNS.filter(s => s.key !== col.key && s.key !== "просрочена").map(s => (
                          <button
                            key={s.key}
                            onClick={() => updateStatus(task.id, s.key)}
                            style={{
                              background: s.color + "22", color: s.color,
                              border: `1px solid ${s.color}44`, borderRadius: 6,
                              padding: "2px 8px", fontSize: 11, cursor: "pointer",
                            }}
                          >
                            {s.emoji} {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}