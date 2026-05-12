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
  archived?: boolean;
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
  { name: "Сергей", username: "pivensa", role: "Генеральный директор", subrole: "Стратегия · Управление · Решения", color: "#C9A84C", accent: "#FFD700", bg: "linear-gradient(135deg, #1a1400 0%, #2a2000 100%)", avatar: "/avatars/sergey.jpg" },
  { name: "Кирилл", username: "eviiilzues", role: "Помощник CEO · Байер · Логистика", subrole: "Китай · Оплаты · Контроль", color: "#9B1B30", accent: "#C4374F", bg: "linear-gradient(135deg, #120006 0%, #200010 100%)", avatar: "/avatars/kirill.jpg" },
  { name: "Надя", username: "nadibozhenova", role: "Менеджер Wildberries", subrole: "Продажи · Карточки · Аналитика WB", color: "#7B2FBE", accent: "#A855F7", bg: "linear-gradient(135deg, #0d0014 0%, #1a0029 100%)", avatar: "/avatars/nadya.jpg" },
  { name: "Рита", username: "margarita030587", role: "Менеджер Ozon", subrole: "Продажи · Карточки · Аналитика Ozon", color: "#0099CC", accent: "#33BBEE", bg: "linear-gradient(135deg, #000d1a 0%, #001829 100%)", avatar: "/avatars/rita.jpg" },
  { name: "Вадим", username: "vadimcheggg", role: "Складской менеджер", subrole: "Хранение · Упаковка · Отгрузки", color: "#00C896", accent: "#4DFFCC", bg: "linear-gradient(135deg, #001a12 0%, #00291e 100%)", avatar: "/avatars/vadim.jpg" },
  { name: "Настя", username: "ssidaan", role: "Маркетолог", subrole: "Реклама · Бартеры · Блогеры", color: "#FF3D8A", accent: "#FF80B4", bg: "linear-gradient(135deg, #1a0010 0%, #29001a 100%)", avatar: "/avatars/nastya.jpg" },
];

const STATUS_COLUMNS = [
  { key: "новая", label: "Новые", color: "#3B82F6", emoji: "🆕" },
  { key: "в работе", label: "В работе", color: "#F59E0B", emoji: "🔄" },
  { key: "выполнена", label: "Выполнено", color: "#10B981", emoji: "✅" },
  { key: "просрочена", label: "Просрочено", color: "#EF4444", emoji: "🔴" },
];

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 4, background: "#ffffff11", borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
    </div>
  );
}

function SidePanel({ open, onClose, allTasks }: { open: boolean; onClose: () => void; tasks: Task[]; allTasks: Task[] }) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const memberStats = TEAM.map(m => {
    const mt = allTasks.filter(t => t.assignee === m.name);
    const done = mt.filter(t => t.status === "выполнена" && !t.archived).length;
    const active = mt.filter(t => t.status !== "выполнена" && !t.archived).length;
    const overdue = mt.filter(t => t.status === "просрочена" && !t.archived).length;
    const archived = mt.filter(t => t.archived).length;
    const total = mt.filter(t => !t.archived).length;
    const rate = (total + archived) > 0 ? Math.round((done / (total + archived)) * 100) : 0;
    return { member: m, done, active, overdue, archived, total, rate };
  });

  const selected = selectedMember ? memberStats.find(s => s.member.name === selectedMember.name) : null;
  const memberTasks = selectedMember
    ? allTasks.filter(t => t.assignee === selectedMember.name && (showArchived ? t.archived : !t.archived))
    : [];

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000066", zIndex: 90, backdropFilter: "blur(2px)" }} />}
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", background: "#0a0a0a", borderLeft: "1px solid #ffffff0f", zIndex: 100, transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.3s ease", display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #ffffff0a", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {selectedMember ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setSelectedMember(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18 }}>←</button>
                <img src={selectedMember.avatar} alt={selectedMember.name} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: `2px solid ${selectedMember.color}` }} />
                {selectedMember.name}
              </div>
            ) : "👥 Команда"}
          </div>
          <button onClick={onClose} style={{ background: "#ffffff11", border: "none", color: "#fff", width: 28, height: 28, borderRadius: 6, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 16, flex: 1 }}>
          {!selectedMember ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {memberStats.map(({ member, done, active, overdue, total, rate }) => (
                <div key={member.username} onClick={() => setSelectedMember(member)} style={{ background: member.bg, border: `1px solid ${member.color}33`, borderRadius: 12, padding: 14, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.border = `1px solid ${member.color}88`}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.border = `1px solid ${member.color}33`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <img src={member.avatar} alt={member.name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: `2px solid ${member.color}` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{member.name}</div>
                      <div style={{ fontSize: 10, color: member.color }}>{member.role}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: member.color }}>{rate}%</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    {[{ label: "Активных", value: active, color: member.color }, { label: "Готово", value: done, color: "#00C896" }, { label: "Просроч.", value: overdue, color: overdue > 0 ? "#FF4444" : "#444" }].map(s => (
                      <div key={s.label} style={{ flex: 1, background: "#ffffff08", borderRadius: 6, padding: "5px 2px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 8, color: "#666" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <StatBar value={done} max={total || 1} color={member.color} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              {selected && (
                <>
                  <div style={{ background: selectedMember.bg, border: `1px solid ${selectedMember.color}33`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: selectedMember.color, marginBottom: 8 }}>{selectedMember.subrole}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                      {[{ label: "Активных", value: selected.active, color: selectedMember.color }, { label: "Выполнено", value: selected.done, color: "#00C896" }, { label: "Просрочено", value: selected.overdue, color: selected.overdue > 0 ? "#FF4444" : "#555" }, { label: "В архиве", value: selected.archived, color: "#888" }].map(s => (
                        <div key={s.label} style={{ background: "#ffffff08", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "#888" }}>{s.label}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "#888" }}>Эффективность</span>
                      <span style={{ fontSize: 10, color: selectedMember.color, fontWeight: 700 }}>{selected.rate}%</span>
                    </div>
                    <StatBar value={selected.done} max={(selected.total + selected.archived) || 1} color={selectedMember.color} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[{ label: "Активные", value: false }, { label: "Архив", value: true }].map(tab => (
                      <button key={String(tab.value)} onClick={() => setShowArchived(tab.value)} style={{ flex: 1, padding: "7px", borderRadius: 8, cursor: "pointer", background: showArchived === tab.value ? selectedMember.color + "22" : "#ffffff08", border: showArchived === tab.value ? `1px solid ${selectedMember.color}66` : "1px solid #ffffff11", color: showArchived === tab.value ? selectedMember.color : "#888", fontSize: 12, fontWeight: 600 }}>{tab.label}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {memberTasks.length === 0 && <div style={{ color: "#444", textAlign: "center", padding: 24 }}>Нет задач</div>}
                    {memberTasks.map(task => {
                      const statusColors: Record<string, string> = { "новая": "#3B82F6", "в работе": "#F59E0B", "выполнена": "#10B981", "просрочена": "#EF4444" };
                      const statusEmoji: Record<string, string> = { "новая": "🆕", "в работе": "🔄", "выполнена": "✅", "просрочена": "🔴" };
                      const color = statusColors[task.status] ?? "#888";
                      return (
                        <div key={task.id} style={{ background: "#141414", border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 12, color: "#fff", marginBottom: 4, lineHeight: 1.4 }}>
                            <span style={{ color: "#555", fontSize: 10 }}>#{task.id}</span> {task.title}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#666" }}>📅 {task.deadline ? new Date(task.deadline).toLocaleDateString("ru-RU") : "без срока"}</span>
                            <span style={{ fontSize: 10, color }}>{statusEmoji[task.status]} {task.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState("");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [isMobile, setIsMobile] = useState(false);
  const [activeCol, setActiveCol] = useState<string>("новая");
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    const interval = setInterval(fetchTasks, 30000);
    const ti = setInterval(() => setTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(ti); window.removeEventListener("resize", check); };
  }, []);

  async function fetchTasks() {
    const [active, archived] = await Promise.all([
      fetch("/api/tasks").then(r => r.json()),
      fetch("/api/tasks?archived=true").then(r => r.json()),
    ]);
    setTasks(active.tasks ?? []);
    setAllTasks([...(active.tasks ?? []), ...(archived.tasks ?? [])]);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchTasks();
    setTimeout(() => setRefreshing(false), 600);
  }

  async function handleCloseWeek() {
    if (!confirm("Закрыть неделю? Все выполненные задачи уйдут в архив.")) return;
    setClosing(true);
    await fetch("/api/tasks?action=close-week", { method: "DELETE" });
    await fetchTasks();
    setClosing(false);
  }

  async function updateStatus(id: number, status: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTasks();
  }

  // Drag & Drop handlers
  function handleDragStart(taskId: number) {
    setDragTaskId(taskId);
  }

  function handleDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    setDragOverCol(colKey);
  }

  function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    if (dragTaskId !== null && colKey !== "просрочена") {
      updateStatus(dragTaskId, colKey);
    }
    setDragTaskId(null);
    setDragOverCol(null);
  }

  function handleDragEnd() {
    setDragTaskId(null);
    setDragOverCol(null);
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
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .task-card { cursor: grab; } .task-card:active { cursor: grabbing; }
        .task-card[draggable]:hover { opacity: 0.9; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>

      <button onClick={() => setPanelOpen(true)} style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", background: "#1a1a1a", border: "1px solid #333", borderRight: "none", borderRadius: "8px 0 0 8px", color: "#888", padding: isMobile ? "12px 6px" : "16px 8px", cursor: "pointer", zIndex: 95, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 10 }}>
        <span style={{ fontSize: 14 }}>👥</span>
        {!isMobile && <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Команда</span>}
        <span>←</span>
      </button>

      <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)} tasks={tasks} allTasks={allTasks} />

      {/* Шапка */}
      <div style={{ padding: isMobile ? "14px 16px" : "20px 40px", borderBottom: "1px solid #ffffff0a", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50, background: "#06060699", backdropFilter: "blur(20px)" }}>
        <div>
          <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800 }}>🏢 Командный центр</div>
          {!isMobile && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>AI Team · WB & Ozon</div>}
        </div>
        <div style={{ display: "flex", gap: isMobile ? 12 : 20, alignItems: "center" }}>
          {[{ label: "Всего", value: totalTasks, color: "#888" }, { label: "Актив.", value: activeTasks, color: "#5B8CFF" }, { label: "Готово", value: doneTasks, color: "#00C896" }, { label: "Просроч.", value: overdueTasks, color: overdueTasks > 0 ? "#FF4444" : "#444" }].map(stat => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 9, color: "#555" }}>{stat.label}</div>
            </div>
          ))}
          {!isMobile && <div style={{ background: "#ffffff08", border: "1px solid #ffffff11", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#888" }}>{time.toLocaleTimeString("ru-RU")}</div>}
        </div>
      </div>

      {/* Фильтр сотрудников */}
      <div style={{ padding: isMobile ? "12px 12px 0" : "20px 40px 0" }}>
        {!isMobile && <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>{selectedMember ? `Задачи: ${selectedMember}` : "Все задачи"}</div>}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
          <div onClick={() => setSelectedMember(null)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: selectedMember === null ? "#ffffff22" : "#ffffff08", border: selectedMember === null ? "1px solid #ffffff44" : "1px solid #ffffff11", fontSize: 12, color: selectedMember === null ? "#fff" : "#666" }}>Все</div>
          {TEAM.map(member => {
            const mt = tasks.filter(t => t.assignee === member.name);
            const active = mt.filter(t => t.status !== "выполнена").length;
            const isSelected = selectedMember === member.name;
            return (
              <div key={member.username} onClick={() => setSelectedMember(isSelected ? null : member.name)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 10, cursor: "pointer", background: isSelected ? member.bg : "#ffffff05", border: isSelected ? `1px solid ${member.color}66` : "1px solid #ffffff0a", boxShadow: isSelected ? `0 4px 16px ${member.color}22` : "none" }}>
                <div style={{ position: "relative", width: 28, height: 28, flexShrink: 0 }}>
                  {isSelected && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${member.color}`, opacity: 0.5, animation: "pulse 2s ease-out infinite" }} />}
                  <img src={member.avatar} alt={member.name} style={{ position: "absolute", inset: isSelected ? 3 : 0, borderRadius: "50%", width: isSelected ? "calc(100% - 6px)" : "100%", height: isSelected ? "calc(100% - 6px)" : "100%", objectFit: "cover", border: `2px solid ${isSelected ? member.color : "#ffffff22"}` }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "#fff" : "#aaa" }}>{member.name}</div>
                  <div style={{ fontSize: 9, color: isSelected ? member.color : "#555" }}>{active} актив.</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Поиск + кнопки */}
      <div style={{ padding: isMobile ? "10px 12px" : "12px 40px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="Поиск..." value={filter} onChange={e => setFilter(e.target.value)} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "7px 12px", color: "#fff", fontSize: 13, width: isMobile ? "100%" : 240, outline: "none" }} />
        <button onClick={handleRefresh} style={{ background: "#ffffff08", border: "1px solid #ffffff11", borderRadius: 8, padding: "7px 12px", color: "#888", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", animation: refreshing ? "spin 0.6s linear" : "none" }}>🔄</span>
          {!isMobile && (refreshing ? "Обновляю..." : "Обновить")}
        </button>
        <button onClick={handleCloseWeek} style={{ background: "#00C89611", border: "1px solid #00C89633", borderRadius: 8, padding: "7px 12px", color: "#00C896", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          {closing ? "⏳" : "✅"} {closing ? "Закрываю..." : "Закрыть неделю"}
        </button>
        {!isMobile && <div style={{ fontSize: 11, color: "#444", marginLeft: 4 }}>← перетащи карточку в другую колонку</div>}
      </div>

      {/* Мобильный переключатель */}
      {isMobile && (
        <div style={{ display: "flex", gap: 6, padding: "0 12px 10px", overflowX: "auto" }}>
          {STATUS_COLUMNS.map(col => (
            <button key={col.key} onClick={() => setActiveCol(col.key)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, cursor: "pointer", background: activeCol === col.key ? col.color + "22" : "#ffffff08", border: activeCol === col.key ? `1px solid ${col.color}66` : "1px solid #ffffff0a", color: activeCol === col.key ? col.color : "#888", fontSize: 12, fontWeight: 600 }}>
              {col.emoji} {col.label} ({filtered.filter(t => col.key === "просрочена" ? isOverdue(t) : t.status === col.key && !isOverdue(t)).length})
            </button>
          ))}
        </div>
      )}

      {/* Доска задач */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12, paddingLeft: isMobile ? 12 : 40, paddingRight: isMobile ? 12 : 40, paddingBottom: isMobile ? 80 : 40 }}>
        {STATUS_COLUMNS.filter(col => !isMobile || col.key === activeCol).map(col => {
          const colTasks = filtered.filter(t =>
            col.key === "просрочена" ? isOverdue(t) : t.status === col.key && !isOverdue(t)
          );
          const isDragTarget = dragOverCol === col.key && col.key !== "просрочена";
          return (
            <div
              key={col.key}
              onDragOver={e => handleDragOver(e, col.key)}
              onDrop={e => handleDrop(e, col.key)}
              style={{
                background: isDragTarget ? col.color + "11" : "#111",
                borderRadius: 12, overflow: "hidden",
                border: isDragTarget ? `2px dashed ${col.color}66` : "2px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {!isMobile && (
                <div style={{ padding: "10px 14px", borderBottom: `2px solid ${col.color}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{col.emoji}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{col.label}</span>
                  <span style={{ marginLeft: "auto", background: col.color + "33", color: col.color, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{colTasks.length}</span>
                </div>
              )}
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: isMobile ? "auto" : 200 }}>
                {colTasks.length === 0 && (
                  <div style={{ color: isDragTarget ? col.color + "88" : "#333", fontSize: 12, textAlign: "center", marginTop: 24, transition: "color 0.15s" }}>
                    {isDragTarget ? "Отпусти здесь" : "Нет задач"}
                  </div>
                )}
                {colTasks.map(task => {
                  const member = TEAM.find(m => m.name === task.assignee);
                  const isDragging = dragTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className="task-card"
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        background: "#1a1a1a", borderRadius: 8, padding: 12,
                        border: `1px solid ${isOverdue(task) ? "#EF444433" : member ? member.color + "22" : "#333"}`,
                        borderLeft: `3px solid ${member ? member.color : "#444"}`,
                        opacity: isDragging ? 0.4 : 1,
                        transform: isDragging ? "scale(0.98)" : "scale(1)",
                        transition: "opacity 0.15s, transform 0.15s",
                        userSelect: "none",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
                        <span style={{ color: "#555", fontSize: 10 }}>#{task.id}</span> {task.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {member && <img src={member.avatar} alt={member.name} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", border: `1px solid ${member.color}` }} />}
                        <span style={{ fontSize: 11, color: member ? member.color : "#888" }}>{task.assignee}</span>
                      </div>
                      <div style={{ fontSize: 10, color: isOverdue(task) ? "#EF4444" : "#666", marginBottom: 8 }}>
                        📅 {formatDate(task.deadline)}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {STATUS_COLUMNS.filter(s => s.key !== col.key && s.key !== "просрочена").map(s => (
                          <button key={s.key} onClick={() => updateStatus(task.id, s.key)} style={{ background: s.color + "22", color: s.color, border: `1px solid ${s.color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>{s.emoji} {s.label}</button>
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