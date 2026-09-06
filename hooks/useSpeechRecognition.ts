"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// SpeechRecognition type declarations for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  hasSupport: boolean;
  error: string | null;
  startListening: (language?: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(
  onResultCallback?: (text: string) => void
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasSupport, setHasSupport] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        setHasSupport(true);
      }
    }
  }, []);

  const startListening = useCallback(
    (language = "en-US") => {
      if (typeof window === "undefined") return;

      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        setError("Speech recognition is not supported in this browser.");
        return;
      }

      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // ignore abort errors on previous instance
          }
        }

        const instance = new SpeechRecognitionClass();
        instance.continuous = false;
        instance.interimResults = true;
        instance.lang = language;

        instance.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        instance.onresult = (event: SpeechRecognitionEvent) => {
          let fullTranscript = "";
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            if (result && result[0]) {
              fullTranscript += result[0].transcript;
            }
          }

          setTranscript(fullTranscript);
          if (onResultCallback && fullTranscript.trim()) {
            onResultCallback(fullTranscript.trim());
          }
        };

        instance.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === "no-speech" || event.error === "aborted") {
            setIsListening(false);
            return;
          }
          setError(`Speech error: ${event.error}`);
          setIsListening(false);
        };

        instance.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = instance;
        instance.start();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start speech recognition");
        setIsListening(false);
      }
    },
    [onResultCallback]
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Speech recognition stop error", e);
      }
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    hasSupport,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
