import { useCallback, useEffect } from "react";
import { useSpeech } from "./useSpeech";
import { useTTS } from "./useTTS";

interface UseVoiceChatOptions {
  agentId: string;
  onTranscript: (text: string) => void;
}

export function useVoiceChat({ agentId, onTranscript }: UseVoiceChatOptions) {
  const {
    isListening,
    micDenied,
    toggleListening,
    stopListening,
  } = useSpeech({
    onResult: onTranscript,
  });

  const {
    isSpeaking,
    isMuted,
    speakText: _speakText,
    queueText: _queueText,
    stop: stopTts,
    toggleMute,
  } = useTTS();

  // Обёртки — не нужно передавать agentId каждый раз
  const speakText = useCallback((text: string) => {
    _speakText(text, agentId);
  }, [_speakText, agentId]);

  const queueText = useCallback((text: string, overrideAgentId?: string) => {
    _queueText(text, overrideAgentId ?? agentId);
  }, [_queueText, agentId]);

  // Cleanup при уходе со страницы
  useEffect(() => {
    return () => {
      stopListening();
      stopTts();
    };
  }, [stopListening, stopTts]);

  return {
    // STT
    isListening,
    micDenied,
    toggleListening,
    stopListening,
    // TTS
    isSpeaking,
    isMuted,
    speakText,
    queueText,
    stopTts,
    toggleMute,
  };
}