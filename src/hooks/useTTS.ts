import { useRef, useState, useCallback } from "react";

interface QueueItem {
  text: string;
  agentId: string;
}

function splitSentences(text: string): string[] {
  // Разбиваем на предложения по знакам препинания
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 3); // убираем слишком короткие
}

async function fetchAudio(text: string, agentId: string): Promise<HTMLAudioElement | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, agentId }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio._objectUrl = url; // сохраняем url для освобождения
    return audio;
  } catch {
    return null;
  }
}

// Расширяем тип Audio чтобы хранить url
declare global {
  interface HTMLAudioElement {
    _objectUrl?: string;
  }
}

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchedRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  const cleanup = useCallback((audio: HTMLAudioElement) => {
    if (audio._objectUrl) {
      URL.revokeObjectURL(audio._objectUrl);
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;

      // Используем prefetch если есть, иначе загружаем
      const audio = prefetchedRef.current ?? await fetchAudio(item.text, item.agentId);
      prefetchedRef.current = null;

      if (!audio) continue;

      // Prefetch следующего предложения пока играет текущее
      if (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        fetchAudio(next.text, next.agentId).then((prefetched) => {
          prefetchedRef.current = prefetched;
        });
      }

      if (mutedRef.current) {
        cleanup(audio);
        continue;
      }

      currentAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          cleanup(audio);
          resolve();
        };
        audio.onerror = () => {
          cleanup(audio);
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    }

    isPlayingRef.current = false;
    setIsSpeaking(false);
    currentAudioRef.current = null;
  }, [cleanup]);

  // Для командного чата — добавляет в очередь, не прерывает
  const queueText = useCallback((text: string, agentId: string) => {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      queueRef.current.push({ text: sentence, agentId });
    }
    processQueue();
  }, [processQueue]);

  // Для 1-на-1 чата — останавливает текущее и начинает новое
  const speakText = useCallback((text: string, agentId: string) => {
    // Стоп текущего
    currentAudioRef.current?.pause();
    queueRef.current = [];
    prefetchedRef.current = null;
    isPlayingRef.current = false;

    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      queueRef.current.push({ text: sentence, agentId });
    }
    processQueue();
  }, [processQueue]);

  const stop = useCallback(() => {
    currentAudioRef.current?.pause();
    if (currentAudioRef.current) cleanup(currentAudioRef.current);
    queueRef.current = [];
    prefetchedRef.current = null;
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setIsMuted(mutedRef.current);
    if (mutedRef.current) {
      currentAudioRef.current?.pause();
    }
  }, []);

  return { isSpeaking, isMuted, queueText, speakText, stop, toggleMute };
}