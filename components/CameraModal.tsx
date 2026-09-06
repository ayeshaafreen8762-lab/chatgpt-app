"use client";

import React, { useRef, useState, useEffect } from "react";
import { Camera, X, RefreshCw, RotateCw, Check } from "lucide-react";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setRotation(0);
      setCameraError(null);
      return;
    }

    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera device not found.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
    }
  };

  const retakeSnapshot = () => {
    setCapturedImage(null);
    setRotation(0);
    startCamera();
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleConfirm = () => {
    if (!capturedImage) return;

    if (rotation === 0) {
      onCapture(capturedImage);
      onClose();
      return;
    }

    // Apply rotation on canvas before exporting
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const is90or270 = rotation === 90 || rotation === 270;
      canvas.width = is90or270 ? img.height : img.width;
      canvas.height = is90or270 ? img.width : img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        const finalUrl = canvas.toDataURL("image/jpeg", 0.9);
        onCapture(finalUrl);
        onClose();
      }
    };
    img.src = capturedImage;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2 text-emerald-400">
            <Camera size={20} />
            <span className="font-semibold text-sm text-gray-100">
              Snap Textbook / Handwritten Doubt
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Video / Snapshot Viewport */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="text-center p-6 text-red-400 text-sm max-w-md">
              <p className="font-semibold mb-2">Camera Unavailable</p>
              <p className="text-xs text-zinc-400">{cameraError}</p>
              <button
                onClick={startCamera}
                className="mt-4 px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white"
              >
                Retry
              </button>
            </div>
          ) : capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center p-2">
              <img
                src={capturedImage}
                alt="Captured doubt"
                className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-200 shadow-lg"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-zinc-950 flex items-center justify-between border-t border-zinc-800">
          {!capturedImage ? (
            <>
              <span className="text-xs text-zinc-400">
                Align the equation or textbook page and capture
              </span>
              <button
                onClick={takeSnapshot}
                disabled={!!cameraError}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-900/30"
              >
                <Camera size={16} />
                Snap Photo
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                >
                  <RotateCw size={14} />
                  Rotate 90°
                </button>
                <button
                  onClick={retakeSnapshot}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                >
                  <RefreshCw size={14} />
                  Retake
                </button>
              </div>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-900/30"
              >
                <Check size={16} />
                Use Photo Doubt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
