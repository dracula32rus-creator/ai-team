interface MicButtonProps {
  isListening: boolean;
  micDenied: boolean;
  onToggle: () => void;
}

export function MicButton({ isListening, micDenied, onToggle }: MicButtonProps) {
  if (micDenied) {
    return (
      <button
        disabled
        title="Доступ к микрофону запрещён — разреши в настройках браузера"
        className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20 border border-red-500/30 flex-shrink-0"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      title={isListening ? "Остановить запись" : "Голосовой ввод"}
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all relative ${
        isListening
          ? "bg-red-500/20 border border-red-500/50"
          : "bg-white/5 border border-white/10 hover:bg-white/10"
      }`}
    >
      {/* Пульсация при записи */}
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse" />
        </>
      )}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isListening ? "#ef4444" : "white"}
        strokeWidth="2"
        className="relative z-10"
      >
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}