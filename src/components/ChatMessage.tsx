"use client";
import { motion } from "framer-motion";

interface ChatMessageProps {
  role: string;
  content: string;
  agentName?: string;
  agentColor?: string;
  index?: number;
}

export function ChatMessage({
  role,
  content,
  agentName,
  agentColor = "#888",
  index = 0,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mr-2 mt-1 flex-shrink-0"
          style={{
            backgroundColor: agentColor + "33",
            color: agentColor,
            boxShadow: `0 0 12px ${agentColor}40`,
          }}
        >
          {agentName?.[0] ?? "А"}
        </div>
      )}

      <div className={`max-w-[75%] ${!isUser ? "space-y-1" : ""}`}>
        {!isUser && agentName && (
          <p className="text-xs px-1" style={{ color: agentColor }}>
            {agentName}
          </p>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap transition-all ${
            isUser
              ? "bg-white text-black rounded-tr-sm"
              : "bg-white/5 backdrop-blur-xl border border-white/10 text-white/90 rounded-tl-sm"
          }`}
          style={
            !isUser
              ? { borderLeftColor: agentColor + "60", borderLeftWidth: "2px" }
              : {}
          }
        >
          {content}
        </div>
      </div>
    </motion.div>
  );
}