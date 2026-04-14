"use client";
import { useState, useRef, useEffect } from "react";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { MicButton } from "@/components/MicButton";

interface AgentResponse {
  agentId: string;
  agentName: string;
  agentColor: string;
  content: string;
}

interface Round {
  question: string;
  responses: AgentResponse[];
}

export default function TeamChat() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAgents, setLoadingAgents] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceChat({
    agentId: "",
    onTranscript: (transcript) => setInput(transcript),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds, loadingAgents]);

  async function askTeam() {
    if (!input.trim() || loading) return;

    const question = input;
    setInput("");
    setLoading(true);
    setLoadingAgents(["Финн", "Стас", "Таня", "Нова", "Макс", "Алекс"]);

    setRounds((prev) => [...prev, { question, responses: [] }]);

    try {
      const res = await fetch("/api/team-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      const data = await res.json();

      for (let i = 0; i < data.responses.length; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const response = data.responses[i];
        setRounds((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            responses: [...updated[updated.length - 1].responses, response],
          };
          return updated;
        });
        voice.queueText(response.content, response.agentId); // ← каждый агент своим голосом
        setLoadingAgents((prev) => prev.filter((n) => n !== response.agentName));
      }
    } catch {
      setRounds((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          responses: [
            {
              agentId: "error",
              agentName: "Система",
              agentColor: "#888",
              content: "Ошибка соединения. Попробуй ещё раз.",
            },
          ],
        };
        return updated;
      });
      setLoadingAgents([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a]">

      {/* Шапка */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <div className="flex -space-x-2">
          {["#185FA5", "#0F6E56", "#BA7517", "#993C1D", "#534AB7", "#5F5E5A"].map((color, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: color + "33", color }}
            >
              {["Ф", "С", "Т", "Н", "М", "А"][i]}
            </div>
          ))}
        </div>
        <div className="flex-1">
          <p className="text-white font-medium text-sm">Командный чат</p>
          <p className="text-white/40 text-xs">Все 6 агентов отвечают сразу</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={voice.toggleMute}
            className={`text-xs px-2 py-1 rounded-full border transition-all ${
              voice.isMuted
                ? "border-yellow-500/50 text-yellow-400"
                : "border-white/10 text-white/30 hover:text-white/50"
            }`}
          >
            {voice.isMuted ? "🔇 мьют" : "🔊 звук"}
          </button>
          {voice.isSpeaking && (
            <button
              onClick={voice.stopTts}
              className="text-xs px-2 py-1 rounded-full border border-red-500/50 text-red-400 animate-pulse"
            >
              ◼ стоп
            </button>
          )}
        </div>
      </div>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">

        {rounds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="flex -space-x-3">
              {["#185FA5", "#0F6E56", "#BA7517", "#993C1D", "#534AB7", "#5F5E5A"].map((color, i) => (
                <div
                  key={i}
                  className="w-12 h-12 rounded-full border-2 border-[#0a0a0a] flex items-center justify-center text-sm font-medium"
                  style={{ backgroundColor: color + "22", color }}
                >
                  {["Ф", "С", "Т", "Н", "М", "А"][i]}
                </div>
              ))}
            </div>
            <p className="text-white/60 text-sm max-w-xs">
              Задай вопрос — вся команда ответит со своей экспертизой
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                "Как увеличить прибыль?",
                "Стоит ли заходить в нишу посуды?",
                "Что делать если заканчивается товар?",
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setInput(hint)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {rounds.map((round, ri) => (
          <div key={ri} className="space-y-3">
            <div className="flex justify-end">
              <div className="max-w-[70%] bg-white text-black text-sm px-4 py-3 rounded-2xl rounded-tr-sm">
                {round.question}
              </div>
            </div>

            <div className="space-y-3">
              {round.responses.map((resp, i) => (
                <div
                  key={i}
                  className="flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 mt-1"
                    style={{
                      backgroundColor: resp.agentColor + "33",
                      color: resp.agentColor,
                    }}
                  >
                    {resp.agentName[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: resp.agentColor }}>
                      {resp.agentName}
                    </p>
                    <div className="bg-[#1a1a1a] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
                      {resp.content}
                    </div>
                  </div>
                </div>
              ))}

              {ri === rounds.length - 1 &&
                loadingAgents.map((name) => (
                  <div key={name} className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/30 flex-shrink-0 mt-1">
                      {name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-white/20 mb-1">{name}</p>
                      <div className="bg-[#1a1a1a] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm inline-flex gap-1">
                        <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Инпут */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex gap-3 items-end bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                askTeam();
              }
            }}
            placeholder={voice.isListening ? "Слушаю..." : "Задай вопрос всей команде..."}
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30 resize-none outline-none disabled:opacity-50"
          />
          <MicButton
            isListening={voice.isListening}
            micDenied={voice.micDenied}
            onToggle={voice.toggleListening}
          />
          <button
            onClick={askTeam}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30 bg-white/10 hover:bg-white/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
        <p className="text-white/20 text-xs text-center mt-2">
          Enter — отправить · Все агенты ответят по очереди
        </p>
      </div>

    </div>
  );
}