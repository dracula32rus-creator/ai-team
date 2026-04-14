"use client";
import { useState, useRef, useEffect } from "react";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { MicButton } from "@/components/MicButton";

interface Message {
  role: string;
  content: string;
  agentName?: string;
  agentColor?: string;
  agentId?: string;
}

export default function RouterChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "На повестке? Напиши что нужно — направлю к нужному специалисту команды.",
      agentName: "Алекс",
      agentColor: "#5F5E5A",
      agentId: "chief-of-staff-alex",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<{
    name: string;
    color: string;
    id: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceChat({
    agentId: currentAgent?.id ?? "chief-of-staff-alex",
    onTranscript: (transcript) => setInput(transcript),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: input },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();
      setCurrentAgent({ name: data.agentName, color: data.agentColor, id: data.agentId });

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        agentName: data.agentName,
        agentColor: data.agentColor,
        agentId: data.agentId,
      };

      setMessages([...newMessages, assistantMessage]);
      voice.queueText(data.response, data.agentId); // ← передаём agentId явно

    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "Ошибка соединения. Попробуй ещё раз.",
          agentName: "Система",
          agentColor: "#888",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a]">

      {/* Шапка */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <div className="w-10 h-10 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-sm font-medium text-white">
          АИ
        </div>
        <div className="flex-1">
          <p className="text-white font-medium text-sm">AI-команда</p>
          <p className="text-white/40 text-xs">
            {currentAgent
              ? `Отвечает: ${currentAgent.name}`
              : "Авто-роутер активен"}
          </p>
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
          <div className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />
          <span className="text-white/40 text-xs">Online</span>
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mr-2 mt-1 flex-shrink-0"
                style={{
                  backgroundColor: (msg.agentColor ?? "#888") + "33",
                  color: msg.agentColor ?? "#888",
                }}
              >
                {msg.agentName?.[0] ?? "А"}
              </div>
            )}
            <div className="max-w-[75%]">
              {msg.role === "assistant" && msg.agentName && (
                <p className="text-xs mb-1" style={{ color: msg.agentColor }}>
                  {msg.agentName}
                </p>
              )}
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-white text-black rounded-tr-sm"
                    : "bg-[#1a1a1a] border border-white/10 text-white/90 rounded-tl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs mr-2 mt-1"
              style={{ color: currentAgent?.color ?? "white" }}
            >
              {currentAgent?.name?.[0] ?? "..."}
            </div>
            <div className="bg-[#1a1a1a] border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
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
                sendMessage();
              }
            }}
            placeholder={voice.isListening ? "Слушаю..." : "Напиши что нужно..."}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30 resize-none outline-none"
          />
          <MicButton
            isListening={voice.isListening}
            micDenied={voice.micDenied}
            onToggle={voice.toggleListening}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
            style={{ backgroundColor: currentAgent?.color ?? "#5F5E5A" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </button>
        </div>
        <p className="text-white/20 text-xs text-center mt-2">
          Enter — отправить · Shift+Enter — новая строка
        </p>
      </div>

    </div>
  );
}