"use client";

import { useEffect, useState } from "react";

interface Task {
  id: number;
  title: string;
  assignee: string;
  status: string;
  deadline?: string;
}

interface Member {
  name: string;
  username: string;
  role: string;
  subrole: string;
  color: string;
  accent: string;
  bg: string;
  emoji: string;
  avatar: string;
}

const TEAM: Member[] = [
  {
    name: "Сергей",
    username: "pivensa",
    role: "Генеральный директор",
    subrole: "Стратегия · Управление · Решения",
    color: "#C9A84C",
    accent: "#FFD700",
    bg: "linear-gradient(135deg, #1a1400 0%, #2a2000 100%)",
    emoji: "👑",
    avatar: "/avatars/sergey.jpg",
  },
  {
    name: "Кирилл",
    username: "eviiilzues",
    role: "Помощник CEO · Байер · Логистика",
    subrole: "Китай · Оплаты · Контроль",
    color: "#9B1B30",
    accent: "#C4374F",
    bg: "linear-gradient(135deg, #120006 0%, #200010 100%)",
    emoji: "⚡",
    avatar: "/avatars/kirill.jpg",
  },
  {
    name: "Надя",
    username: "nadibozhenova",
    role: "Менеджер Wildberries",
    subrole: "Продажи · Карточки · Аналитика WB",
    color: "#7B2FBE",
    accent: "#A855F7",
    bg: "linear-gradient(135deg, #0d0014 0%, #1a0029 100%)",
    emoji: "🟣",
    avatar: "/avatars/nadya.jpg",
  },
  {
    name: "Рита",
    username: "margarita030587",
    role: "Менеджер Ozon",
    subrole: "Продажи · Карточки · Аналитика Ozon",
    color: "#0099CC",
    accent: "#33BBEE",
    bg: "linear-gradient(135deg, #000d1a 0%, #001829 100%)",
    emoji: "🔵",
    avatar: "/avatars/rita.jpg",
  },
  {
    name: "Вадим",
    username: "vadimcheggg",
    role: "Складской менеджер",
    subrole: "Хранение · Упаковка · Отгрузки",
    color: "#00C896",
    accent: "#4DFFCC",
    bg: "linear-gradient(135deg, #001a12 0%, #00291e 100%)",
    emoji: "📦",
    avatar: "/avatars/vadim.jpg",
  },
  {
    name: "Настя",
    username: "ssidaan",
    role: "Маркетолог",
    subrole: "Реклама · Бартеры · Блогеры",
    color: "#FF3D8A",
    accent: "#FF80B4",
    bg: "linear-gradient(135deg, #1a0010 0%, #29001a 100%)",
    emoji: "🎯",
    avatar: "/avatars/nastya.jpg",
  },
];

function MemberCard({ member, tasks, onClick }: { member: Member; tasks: Task[]; onClick: () => void }) {
  const memberTasks = tasks.filter(t => t.assignee === member.name);
  const done = memberTasks.filter(t => t.status === "выполнена").length;
  const active = memberTasks.filter(t => t.status !== "выполнена").length;
  const overdue = memberTasks.filter(t => t.status === "просрочена").length;
  const progress = memberTasks.length > 0 ? Math.round((done / memberTasks.length) * 100) : 0;

  return (
    <div
      onClick={onClick}
      style={{
        background: member.bg,
        border: `1px solid ${member.color}33`,
        borderRadius: 16,
        padding: 24,
        cursor: "pointer",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.border = `1px solid ${member.color}88`;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 20px 60px ${member.color}22`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.border = `1px solid ${member.color}33`;
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div style={{
        position: "absolute", top: -40, right: -40, width: 120, height: 120,
        borderRadius: "50%", background: member.color + "11", pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              position: "absolute", inset: i * 8, borderRadius: "50%",
              border: `1.5px solid ${member.color}`,
              opacity: 0.6 - i * 0.3,
              animation: `pulse ${1.8 + i * 0.5}s ease-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }} />
          ))}
          <img
            src={member.avatar}
            alt={member.name}
            style={{
              position: "absolute",
              inset: 6,
              borderRadius: "50%",
              width: "calc(100% - 12px)",
              height: "calc(100% - 12px)",
              objectFit: "cover",
              border: `2px solid ${member.color}`,
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
            {member.name}
          </div>
          <div style={{ fontSize: 12, color: member.color, fontWeight: 600, marginBottom: 2 }}>
            {member.role}
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>{member.subrole}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#888" }}>Выполнение задач</span>
          <span style={{ fontSize: 11, color: member.color, fontWeight: 700 }}>{progress}%</span>
        </div>
        <div style={{ height: 4, background: "#ffffff11", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: `linear-gradient(90deg, ${member.color}, ${member.accent})`,
            borderRadius: 4, transition: "width 1s ease",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {[
          { label: "Активных", value: active, color: member.color },
          { label: "Готово", value: done, color: "#00C896" },
          { label: "Просрочено", value: overdue, color: overdue > 0 ? "#FF4444" : "#444" },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1, background: "#ffffff08", borderRadius: 8, padding: "8px 4px",
            textAlign: "center", border: "1px solid #ffffff08",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: "#666" }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberModal({ member, tasks, onClose }: { member: Member; tasks: Task[]; onClose: () => void }) {
  const memberTasks = tasks.filter(t => t.assignee === member.name);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#000000cc",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0a0a0a",
          border: `1px solid ${member.color}44`,
          borderRadius: 24, padding: 40,
          width: "90%", maxWidth: 600,
          maxHeight: "80vh", overflowY: "auto",
          position: "relative",
          boxShadow: `0 40px 120px ${member.color}22`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
          <div style={{ position: "relative", width: 80, height: 80 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: "absolute", inset: i * 10, borderRadius: "50%",
                border: `1.5px solid ${member.color}`,
                opacity: 0.8 - i * 0.25,
                animation: `pulse ${1.5 + i * 0.4}s ease-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }} />
            ))}
            <img
              src={member.avatar}
              alt={member.name}
              style={{
                position: "absolute",
                inset: 8,
                borderRadius: "50%",
                width: "calc(100% - 16px)",
                height: "calc(100% - 16px)",
                objectFit: "cover",
                border: `2px solid ${member.color}`,
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{member.name}</div>
            <div style={{ fontSize: 14, color: member.color, fontWeight: 600 }}>{member.role}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{member.subrole}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: "auto", background: "#ffffff11", border: "none",
              color: "#fff", width: 32, height: 32, borderRadius: 8,
              cursor: "pointer", fontSize: 16,
            }}
          >✕</button>
        </div>

        <div style={{ fontSize: 14, color: "#888", marginBottom: 16 }}>
          Задачи ({memberTasks.length})
        </div>

        {memberTasks.length === 0 && (
          <div style={{ color: "#444", textAlign: "center", padding: 40 }}>Задач нет</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {memberTasks.map(task => {
            const statusColors: Record<string, string> = {
              "новая": "#5B8CFF", "в работе": "#F59E0B",
              "выполнена": "#00C896", "просрочена": "#FF4444",
            };
            const statusEmoji: Record<string, string> = {
              "новая": "🆕", "в работе": "🔄", "выполнена": "✅", "просрочена": "🔴",
            };
            const color = statusColors[task.status] ?? "#888";

            return (
              <div key={task.id} style={{
                background: "#ffffff06",
                border: `1px solid ${color}22`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 8, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span>{statusEmoji[task.status] ?? "📋"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#fff" }}>{task.title}</div>
                  {task.deadline && (
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                      📅 {new Date(task.deadline).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color, fontWeight: 600 }}>{task.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetchTasks();
    const ti = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(ti);
  }, []);

  async function fetchTasks() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "выполнена").length;
  const overdueTasks = tasks.filter(t => t.status === "просрочена").length;
  const activeTasks = tasks.filter(t => t.status !== "выполнена").length;

  return (
    <div style={{
      minHeight: "100vh", background: "#060606",
      color: "#fff", fontFamily: "'SF Pro Display', -apple-system, sans-serif",
    }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>

      <div style={{
        padding: "28px 40px", borderBottom: "1px solid #ffffff0a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50,
        background: "#06060699",
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            🏢 Командный центр
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>AI Team · WB & Ozon</div>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[
            { label: "Всего задач", value: totalTasks, color: "#888" },
            { label: "Активных", value: activeTasks, color: "#5B8CFF" },
            { label: "Выполнено", value: doneTasks, color: "#00C896" },
            { label: "Просрочено", value: overdueTasks, color: overdueTasks > 0 ? "#FF4444" : "#444" },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: "#555" }}>{stat.label}</div>
            </div>
          ))}

          <div style={{
            background: "#ffffff08", border: "1px solid #ffffff11",
            borderRadius: 10, padding: "8px 16px",
            fontSize: 13, color: "#888", fontVariantNumeric: "tabular-nums",
          }}>
            {time.toLocaleTimeString("ru-RU")}
          </div>
        </div>
      </div>

      <div style={{
        padding: 40,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 20,
        animation: "fadeIn 0.6s ease",
      }}>
        {TEAM.map(member => (
          <MemberCard
            key={member.username}
            member={member}
            tasks={tasks}
            onClick={() => setSelected(member)}
          />
        ))}
      </div>

      {selected && (
        <MemberModal
          member={selected}
          tasks={tasks}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}