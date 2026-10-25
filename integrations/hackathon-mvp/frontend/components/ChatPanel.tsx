"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, sendChat, type ChatMessage, type ModelOption } from "@/lib/api";

const MAX_INPUT = 2000;

export default function ChatPanel({
  model,
  productName,
  description,
  style,
  platform,
  disabled,
  onUseAsDescription,
}: {
  model: ModelOption | undefined;
  productName: string;
  description: string;
  style: string;
  platform: string;
  disabled: boolean;
  onUseAsDescription: (text: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockReply, setIsMockReply] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  // 切换模型时清空对话，避免把上一个模型的上下文带给另一个模型
  const modelId = model?.id;
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [modelId]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || disabled || !model) return;
    if (!model.configured) {
      setError(`模型「${model.name}」尚未配置完整，请先在后端补充配置`);
      return;
    }
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await sendChat({
        model_id: model.id,
        messages: next.slice(-19),
        product_name: productName,
        description,
        style,
        platform,
      });
      setIsMockReply(res.is_mock);
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      // 发送失败：回退这条用户消息到输入框，方便重试
      setMessages(messages);
      setInput(text);
      setError(e instanceof ApiError ? e.message : "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  // 提取「活动描述：」之后的内容，否则使用整条回复
  function extractDescription(reply: string): string {
    const m = reply.match(/活动描述[：:]\s*([\s\S]+)$/);
    return (m ? m[1] : reply).trim();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-600">和模型聊聊，打磨活动描述</h3>
        {isMockReply && messages.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
            Mock 回复，非真实 AI
          </span>
        )}
      </div>

      <div
        className="mb-2 max-h-56 space-y-2 overflow-y-auto"
        aria-live="polite"
        aria-label="对话记录"
      >
        {messages.length === 0 && (
          <p className="text-xs text-slate-400">
            例如：「帮我把活动描述写得更吸引人，主打新品尝鲜和限时折扣」
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                "inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm " +
                (m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-800")
              }
            >
              {m.content}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const text = extractDescription(m.content);
                    if (text.length > MAX_INPUT) {
                      setError("这条回复超过 2000 字，请让模型精简后再用作活动描述");
                      return;
                    }
                    setError(null);
                    onUseAsDescription(text);
                  }}
                  className="text-xs text-blue-600 hover:underline disabled:text-slate-400"
                >
                  用作活动描述
                </button>
              </div>
            )}
          </div>
        ))}
        {sending && <p className="text-xs text-slate-400">模型思考中…</p>}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          maxLength={MAX_INPUT}
          disabled={sending || disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="输入想问的内容，回车发送"
          aria-label="对话输入框"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sending || disabled || !model?.configured}
          className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {sending ? "发送中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
