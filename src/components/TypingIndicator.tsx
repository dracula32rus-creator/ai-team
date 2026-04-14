"use client";
import { motion } from "framer-motion";

interface TypingIndicatorProps {
  agentName?: string;
  agentColor?: string;
}

export function TypingIndicator({
  agentName,
  agentColor = "#888",
}: TypingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex justify-start"
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mr-2 mt-1 flex-shrink-0"
        style={{
          backgroundColor: agentColor + "33",
          color: agentColor,
          boxShadow: `0 0 12px ${agentColor}40`,
        }}
      >
        {agentName?.[0] ?? "..."}
      </div>
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-3 rounded-2xl rounded-tl-sm">
        <div className="flex gap-1 items-center">
          {[0, 150, 300].map((delay) => (
            <motion.span
              key={delay}
              className="w-1.5 h-1.5 rounded-full bg-white/40"
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: delay / 1000,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}