"use client";
import { SavedWorkspaceSchema } from "./studio-state";
import type { z } from "zod";

type Saved = z.infer<typeof SavedWorkspaceSchema>;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("morphsite-workspaces", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("workspace")) request.result.createObjectStore("workspace"); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("草稿数据库暂时被占用。"));
  });
}
export async function readWorkspace(): Promise<Saved | null> {
  const db = await database();
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("workspace", "readonly").objectStore("workspace").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (raw === undefined) return null;
    return SavedWorkspaceSchema.parse(raw);
  } finally { db.close(); }
}
let queue: Promise<void> = Promise.resolve();
export function saveWorkspace(saved: Saved): Promise<void> {
  queue = queue.catch(() => {}).then(async () => {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("workspace", "readwrite");
        transaction.objectStore("workspace").put(SavedWorkspaceSchema.parse(saved), "current");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  });
  return queue;
}
