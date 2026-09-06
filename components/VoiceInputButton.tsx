"use client";

import React, { useState, useEffect } from "react";
import { Mic, MicOff, Radio } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onStart?: () => void;
  onListeningChange?: (isListening: boolean) => void;
  className?: string;
  placeholderText?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  onStart,
  onListeningChange,
  className = "",
}) => {
  const { isListening, hasSupport, startListening, stopListening, resetTranscript } =
    useSpeechRecognition((liveTranscript) => {
      if (liveTranscript) {
        onTranscript(liveTranscript);
      }
    });

  useEffect(() => {
    if (onListeningChange) {
      onListeningChange(isListening);
    }
  }, [isListening, onListeningChange]);

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hasSupport) {
      alert("Speech Recognition is not supported by your browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      if (onStart) onStart();
      resetTranscript();
      startListening();
    }
  };

  if (!hasSupport) {
    return (
      <button
        type="button"
        disabled
        className={`p-2 rounded-lg text-gray-600 opacity-50 cursor-not-allowed ${className}`}
        title="Speech recognition not supported in this browser"
      >
        <MicOff size={18} />
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      {isListening && (
        <div className="absolute -top-9 right-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950/90 border border-red-500/50 text-[11px] font-semibold text-red-400 backdrop-blur shadow-lg animate-bounce z-20 pointer-events-none whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span>Listening... Speak now</span>
        </div>
      )}

      <button
        type="button"
        onClick={toggleListening}
        className={`p-2 rounded-lg transition-all duration-200 relative ${
          isListening
            ? "bg-red-500/20 text-red-400 border border-red-500/50 ring-2 ring-red-500/40 animate-pulse"
            : "text-gray-400 hover:text-white hover:bg-white/10"
        } ${className}`}
        title={isListening ? "Stop Voice Recording" : "Start Voice Input (Speech-to-Text)"}
      >
        {isListening ? (
          <Radio size={18} className="animate-spin text-red-400" />
        ) : (
          <Mic size={18} />
        )}
      </button>
    </div>
  );
};

export default VoiceInputButton;
