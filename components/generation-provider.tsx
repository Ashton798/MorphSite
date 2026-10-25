"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchAiStatus, requestGenerate, type GeneratedBrand } from "@/lib/ai-client";
import type { GenerationStage } from "@/lib/ai/contracts";
import { soundManager } from "@/lib/sound-manager";
import type { AiStatus } from "@/lib/ai-client";

export type GenerationTask = { prompt: string; image: string | null; stage: GenerationStage };
type TaskCallbacks = { onSuccess: (result: GeneratedBrand, prompt: string) => void; onFailure: (message: string, prompt: string) => void };
type GenerationContextValue = {
  ai: AiStatus; aiReady: boolean; task: GenerationTask | null;
  subscribe: (callback: TaskCallbacks) => () => void;
  startGeneration: (prompt: string, image: string | null) => void;
  consumePending: (prompt: string) => GeneratedBrand | null;
  consumePendingFailure: (prompt: string) => string | null;
  clearTask: () => void;
};
const OFFLINE: AiStatus = { enabled: false, imageEnabled: false, videoEnabled: false, model: "offline", imageModel: "offline", videoModel: "offline" };
const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [ai, setAi] = useState<AiStatus>(OFFLINE);
  const [aiReady, setAiReady] = useState(false);
  const [task, setTask] = useState<GenerationTask | null>(null);
  const pending = useRef<Map<string, GeneratedBrand>>(new Map());
  const pendingFailures = useRef<Map<string, string>>(new Map());
  const callbacks = useRef<Set<TaskCallbacks>>(new Set());
  const running = useRef(false);
  const aiRef = useRef(ai);
  const statusPromise = useRef<Promise<AiStatus> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    statusPromise.current = fetchAiStatus().then((status) => {
      aiRef.current = status; setAi(status); setAiReady(true); return status;
    });
    return () => { mounted.current = false; };
  }, []);

  const subscribe = useCallback((callback: TaskCallbacks) => {
    callbacks.current.add(callback);
    return () => { callbacks.current.delete(callback); };
  }, []);

  const startGeneration = useCallback((prompt: string, image: string | null) => {
    if (running.current) return;
    running.current = true;
    setTask({ prompt, image, stage: "queued" });
    const run = async () => {
      const status = statusPromise.current ? await statusPromise.current : aiRef.current;
      if (!status.enabled) {
        running.current = false;
        if (mounted.current) setTask(null);
        return;
      }
      try {
        const result = await requestGenerate(prompt, image, (stage) => {
          if (mounted.current) setTask({ prompt, image, stage });
        });
        if (!callbacks.current.size) pending.current.set(prompt, result);
        else callbacks.current.forEach((callback) => callback.onSuccess(result, prompt));
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : "生成失败，请重试。";
        if (callbacks.current.size) callbacks.current.forEach((callback) => callback.onFailure(message, prompt));
        else pendingFailures.current.set(prompt, message);
      } finally {
        running.current = false;
        if (mounted.current) setTask(null);
      }
    };
    void run();
  }, []);

  const consumePending = useCallback((prompt: string) => {
    const result = pending.current.get(prompt) ?? null;
    pending.current.delete(prompt);
    return result;
  }, []);
  const consumePendingFailure = useCallback((prompt: string) => {
    const message = pendingFailures.current.get(prompt) ?? null;
    pendingFailures.current.delete(prompt);
    return message;
  }, []);
  const clearTask = useCallback(() => setTask(null), []);

  return <GenerationContext.Provider value={{ ai, aiReady, task, subscribe, startGeneration, consumePending, consumePendingFailure, clearTask }}>
    {children}
  </GenerationContext.Provider>;
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) throw new Error("useGeneration must be used inside GenerationProvider");
  return context;
}

/** A user-gesture-safe wrapper: no AudioContext is constructed while muted. */
export function playInterfaceSound(cue: "tap" | "ripple" | "whoosh" | "success") {
  void soundManager.play(cue, true);
}
