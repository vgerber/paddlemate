import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { useCallback, useEffect } from "react";
import { type LiveEvent, notificationsApi } from "@/lib/api";
import { rawRequest } from "@/lib/api/client";
import { descentKeys } from "./useDescents";
import { tripKeys } from "./useTrips";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
  state: () => [...notificationKeys.all, "state"] as const,
  push: () => [...notificationKeys.all, "push"] as const,
};

export function useNotificationState(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.state(),
    queryFn: () => notificationsApi.state(),
    enabled,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => notificationsApi.list(),
    enabled,
  });
}

/** Refetches the list and the count together, so they agree. */
export function useRefreshNotifications() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
    [qc],
  );
}

/** Marks read up to a given moment. Only the count refetches: the open list
 * keeps showing which entries were new when it was opened. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (readUntil: string) => notificationsApi.markRead(readUntil),
    onSuccess: (state) => qc.setQueryData(notificationKeys.state(), state),
  });
}

function refreshTrip(qc: QueryClient, event: LiveEvent) {
  qc.invalidateQueries({ queryKey: tripKeys.detail(event.trip_id) });
  qc.invalidateQueries({ queryKey: tripKeys.lists() });
  qc.invalidateQueries({ queryKey: descentKeys.trip(event.trip_id) });
  qc.invalidateQueries({ queryKey: notificationKeys.all });
}

function refreshEverything(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: tripKeys.all });
  qc.invalidateQueries({ queryKey: descentKeys.lists() });
  qc.invalidateQueries({ queryKey: notificationKeys.all });
}

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 60_000;

/** Keeps the signed-in app current: listens to the server's trip changes
 * and refetches what they touch. EventSource cannot send a bearer token, so
 * this reads the stream with fetch, and reconnects with backoff when it
 * drops. Missed events on a reconnect are covered by refetching everything. */
export function useLiveTripEvents(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let retry = RETRY_MIN_MS;
    let opened = false;

    const listen = async () => {
      const { url, headers } = await rawRequest("/api/v1/users/me/events");
      headers.set("Accept", "text/event-stream");
      const res = await fetch(url, { headers, signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`stream: ${res.status}`);
      const reader = res.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .getReader();
      for (;;) {
        const { value: m, done } = await reader.read();
        if (done) return;
        if (m.event === "connected") {
          retry = RETRY_MIN_MS;
          // A reopened stream missed whatever happened while it was down.
          if (opened) refreshEverything(qc);
          opened = true;
        } else if (m.event === "trip_event") {
          refreshTrip(qc, JSON.parse(m.data) as LiveEvent);
        } else if (m.event === "resync") {
          refreshEverything(qc);
        }
      }
    };

    const run = async () => {
      while (!abort.signal.aborted) {
        try {
          await listen();
        } catch {
          // Dropped or refused; the retry below is the handling.
        }
        if (abort.signal.aborted) return;
        await new Promise((r) => setTimeout(r, retry));
        retry = Math.min(retry * 2, RETRY_MAX_MS);
      }
    };
    run();
    return () => abort.abort();
  }, [enabled, qc]);
}

/** Whether this browser can take push at all: a service worker, the Push
 * API, and a server that sends it. */
export function pushSupported(publicKey: string | undefined): boolean {
  return (
    !!publicKey &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window
  );
}

async function currentSubscription(): Promise<globalThis.PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** A base64url key as bytes. `Uint8Array.fromBase64` does this, but iPhones
 * before iOS 18.2 lack it, and push is most wanted on phones. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Whether this device has push on: the browser holds a subscription and
 * the server still knows it. */
export function usePushOnThisDevice(publicKey: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.push(),
    queryFn: async () => {
      const [local, known] = await Promise.all([
        currentSubscription(),
        notificationsApi.pushSubscriptions(),
      ]);
      return !!local && known.some((s) => s.endpoint === local.endpoint);
    },
    enabled: pushSupported(publicKey),
  });
}

/** Stops push on this device, on the server and in the browser. Signing out
 * calls it: a shared tablet must not keep showing the last person's trips.
 * Never throws and never waits long - sign-out goes ahead regardless, and
 * an endpoint the browser dropped is forgotten at the next push anyway. */
export async function forgetThisDevice(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const forget = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return;
    const known = await notificationsApi.pushSubscriptions();
    const mine = known.find((s) => s.endpoint === sub.endpoint);
    if (mine) await notificationsApi.unsubscribePush(mine.id);
    await sub.unsubscribe();
  };
  await Promise.race([
    forget().catch(() => undefined),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
}

export function useSetPush(publicKey: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => {
      if (!publicKey) throw new Error("This server does not send push");
      if (on) {
        if ((await Notification.requestPermission()) !== "granted") {
          throw new Error(
            "Notifications are blocked for this site in the browser settings",
          );
        }
        const registration = await navigator.serviceWorker.ready;
        const sub =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(publicKey),
          }));
        const json = sub.toJSON();
        await notificationsApi.subscribePush({
          endpoint: sub.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        });
        return;
      }
      const sub = await currentSubscription();
      if (!sub) return;
      const known = await notificationsApi.pushSubscriptions();
      const mine = known.find((s) => s.endpoint === sub.endpoint);
      if (mine) await notificationsApi.unsubscribePush(mine.id);
      await sub.unsubscribe();
    },
    // The settings panel shows the failure beside the switch.
    meta: { errorHandledLocally: true },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: notificationKeys.push() }),
  });
}
