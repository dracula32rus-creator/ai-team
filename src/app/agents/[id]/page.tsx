"use client";
import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getAgent } from "@/config/agents";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { MicButton } from "@/components/MicButton";
import { Aurora } from "@/components/Aurora";
import { ChatMessage } from "@/components/ChatMessage";
import { TypingIndicator } from "@/components/TypingIndicator";

export default function AgentChat() {
  const { id } = useParams();
  const agent = getAgent(id as string);

  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceChat({
    agentId: agent?.id ?? "",
    onTranscript: (transcript) => setInput(transcript),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!agent) return <div>Agent not found</div>;

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/agent-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newMessages, systemPrompt: agent!.systemPrompt }),
    });
    const data = await res.json();
    setMessages([...newMessages, { role: "assistant", content: data.response }]);
    voice.speakText(data.response);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] relative overflow-hidden">

      {/* Aurora фон */}
      <Aurora
        colorStops={[agent.color, agent.color + "88", "#0a0a0a"]}
        blend={0.15}
        speed={0.3}
      />

      {/* Контент поверх Aurora */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Шапка */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl"
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
            style={{
              backgroundColor: agent.color + "33",
              color: agent.color,
              boxShadow: `0 0 20px ${agent.color}40`,
            }}
          >
            {agent.name[0]}
          </div>
          <div className="flex-1">
            <p className="text-white font-medium text-sm">{agent.name}</p>
            <p className="text-white/40 text-xs">{agent.role}</p>
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
            <AnimatePresence>
              {voice.isSpeaking && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={voice.stopTts}
                  className="text-xs px-2 py-1 rounded-full border border-red-500/50 text-red-400"
                >
                  ◼ стоп
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Сообщения */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <ChatMessage
                key={i}
                role={msg.role}
                content={msg.content}
                agentName={agent.name}
                agentColor={agent.color}
                index={i}
              />
            ))}
            {loading && (
              <TypingIndicator
                key="typing"
                agentName={agent.name}
                agentColor={agent.color}
              />
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Инпут */}
        <div className="px-4 py-4 border-t border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="flex gap-3 items-end bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={voice.isListening ? "Слушаю..." : "Напиши или скажи..."}
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
              style={{
                backgroundColor: agent.color,
                boxShadow: `0 0 12px ${agent.color}60`,
              }}
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
    </div>
  );
}