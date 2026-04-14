import Link from "next/link";
import Image from "next/image";
import { agents } from "@/config/agents";

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
              {agents.slice(0, 3).map((agent, i) => (
                <Image
                  key={i}
                  src={agent.avatar}
                  alt={agent.name}
                  width={28}
                  height={28}
                  className="rounded-full object-cover border-2 border-[#0a0a0a]"
                />
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
              <Image
                src={agent.avatar}
                alt={agent.name}
                width={44}
                height={44}
                className="rounded-full object-cover flex-shrink-0"
                style={{ boxShadow: `0 0 12px ${agent.color}40` }}
              />
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