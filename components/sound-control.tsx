"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { soundManager, DEFAULT_SOUND } from "@/lib/sound-manager";

export function SoundControl() {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState(DEFAULT_SOUND);
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    setSettings(soundManager.initialize());
    setAvailable(typeof window.AudioContext !== "undefined");
    return soundManager.subscribe(setSettings);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !toggle.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  async function toggleSound() {
    const nextMuted = !settings.muted;
    soundManager.setMuted(nextMuted);
    if (!nextMuted) {
      const unlocked = await soundManager.unlock();
      setAvailable(unlocked);
      if (unlocked) await soundManager.play("ripple", true);
      else soundManager.setMuted(true);
    }
    setSettings(soundManager.snapshot);
  }

  return <div className="sound-control" ref={panel}>
    {open && <div className="sound-panel" id={id} role="group" aria-label="界面音效设置">
      <div className="sound-panel-heading"><span>LIQUID SOUND</span><strong>{settings.muted ? "已静音" : available ? "音效已开启" : "当前浏览器无法播放"}</strong></div>
      <p>原创合成界面音效，无背景音乐。</p>
      <label htmlFor={`${id}-volume`}>音量 <span>{Math.round(settings.volume * 100)}%</span></label>
      <input id={`${id}-volume`} aria-label="音效音量" type="range" min="0" max="35" step="1" value={Math.round(settings.volume * 100)} onChange={(event) => soundManager.setVolume(Number(event.target.value) / 100)} />
      <button type="button" className="sound-mute-action" onClick={() => { void toggleSound(); }}>{settings.muted ? "开启声音" : "立即静音"}</button>
      <button type="button" className="sound-mute-action sound-preview" disabled={settings.muted} onClick={() => { void soundManager.play("success", true); }}>试听音效</button>
    </div>}
    <button ref={toggle} className="sound-toggle" type="button" aria-label={settings.muted ? "开启界面音效" : "关闭界面音效"} aria-pressed={!settings.muted} aria-expanded={open} aria-controls={id}
      title={settings.muted ? "声音默认关闭；点击开启" : "立即静音；右键或点击音量面板调整"}
      onClick={() => { void toggleSound(); }}
      onContextMenu={(event) => { event.preventDefault(); setOpen(!open); }}>
      {settings.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{settings.muted ? "开启声音" : "声音已开启"}</span>
    </button>
    <button className="sound-settings-label" type="button" aria-label="调节音效音量" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>音量</button>
  </div>;
}
