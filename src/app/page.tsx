import Link from "next/link";

const agents = [
  { id: "cfo-finn", name: "Финн", role: "CFO — Финансовый директор", color: "#185FA5", initial: "Ф" },
  { id: "supply-stas", name: "Стас", role: "Supply Planner — Закупки", color: "#0F6E56", initial: "С" },
  { id: "accountant-tanya", name: "Таня", role: "Accountant — Учёт расходов", color: "#BA7517", initial: "Т" },
  { id: "buyer-nova", name: "Нова", role: "Buyer — Поиск товаров", color: "#993C1D", initial: "Н" },
  { id: "content-max", name: "Макс", role: "Content — Карточки товаров", color: "#534AB7", initial: "М" },
  { id: "chief-of-staff-alex", name: "Алекс", role: "Chief of Staff — Стратег", color: "#5F5E5A", initial: "А" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-4 py-12">
      <div className="max-w-3xl mx-auto">

        {/* Заголовок */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-semibold text-white mb-2">AI-команда</h1>
          <p className="text-white/40 text-sm">Твои виртуальные сотрудники для WB и Ozon</p>
        </div>

        {/* Быстрый доступ */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link
            href="/router"
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4 hover:bg-white/10 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-sm font-medium">
              АИ
            </div>
            <div>
              <p className="text-white text-sm font-medium">Авто-роутер</p>
              <p className="text-white/40 text-xs">Умный выбор агента</p>
            </div>
          </Link>
          <Link
            href="/team"
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4 hover:bg-white/10 transition-all"
          >
            <div className="flex -space-x-2">
              {["#185FA5", "#0F6E56", "#BA7517"].map((color, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 border-[#0a0a0a] flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: color + "33", color }}
                >
                  {["Ф", "С", "Т"][i]}
                </div>
              ))}
            </div>
            <div>
              <p className="text-white text-sm font-medium">Командный чат</p>
              <p className="text-white/40 text-xs">Все 6 агентов сразу</p>
            </div>
          </Link>
        </div>

        {/* Агенты */}
        <p className="text-white/30 text-xs uppercase tracking-wider mb-4">Специалисты</p>
        <div className="space-y-2">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-4 hover:bg-white/10 transition-all group"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                style={{
                  backgroundColor: agent.color + "33",
                  color: agent.color,
                  boxShadow: `0 0 12px ${agent.color}30`,
                }}
              >
                {agent.initial}
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{agent.name}</p>
                <p className="text-white/40 text-xs">{agent.role}</p>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-white/20 group-hover:text-white/50 transition-colors"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}