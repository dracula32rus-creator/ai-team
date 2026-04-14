"use client";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import Image from "next/image";

interface ChatMessageProps {
  role: string;
  content: string;
  agentName?: string;
  agentColor?: string;
  agentAvatar?: string;
  index?: number;
}

export function ChatMessage({
  role,
  content,
  agentName,
  agentColor = "#888",
  agentAvatar,
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
        <div className="mr-2 mt-1 flex-shrink-0">
          {agentAvatar ? (
            <Image
              src={agentAvatar}
              alt={agentName ?? "agent"}
              width={28}
              height={28}
              className="rounded-full object-cover"
              style={{ boxShadow: `0 0 12px ${agentColor}40` }}
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
              style={{
                backgroundColor: agentColor + "33",
                color: agentColor,
                boxShadow: `0 0 12px ${agentColor}40`,
              }}
            >
              {agentName?.[0] ?? "А"}
            </div>
          )}
        </div>
      )}

      <div className={`max-w-[75%] ${!isUser ? "space-y-1" : ""}`}>
        {!isUser && agentName && (
          <p className="text-xs px-1" style={{ color: agentColor }}>
            {agentName}
          </p>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
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
          {isUser ? (
            content
          ) : (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-white/20 px-2 py-1 text-left text-white/70 bg-white/5">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border border-white/10 px-2 py-1">{children}</td>
                ),
                code: ({ children }) => (
                  <code className="bg-white/10 px-1 rounded text-xs font-mono">{children}</code>
                ),
                h1: ({ children }) => <h1 className="text-base font-semibold text-white mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-sm font-semibold text-white mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-medium text-white mb-1">{children}</h3>,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </motion.div>
  );
}