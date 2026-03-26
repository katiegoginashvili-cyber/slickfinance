// Supabase Edge Function: send-reminders
// Runs every 5 minutes via pg_cron. Queries all subscriptions where a
// reminder is due, sends push notifications with retry + receipt checking,
// and logs failures for later retry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const LOGODEV_TOKEN = "pk_SQVsaKc_RfuK49MneNGgxw";
const MAX_RETRIES = 3;
const BATCH_SIZE = 100;

function buildLogoUrl(domain: string): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase();
  const params = new URLSearchParams({
    token: LOGODEV_TOKEN,
    size: "128",
    format: "png",
    theme: "light",
    retina: "true",
    fallback: "404",
  });
  return `https://img.logo.dev/${encodeURIComponent(clean)}?${params.toString()}`;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(
  messages: Record<string, unknown>[],
  attempt = 1
): Promise<{ tickets: Record<string, unknown>[]; failed: Record<string, unknown>[] }> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Expo Push API returned ${res.status}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(delay);
        return sendWithRetry(messages, attempt + 1);
      }
      return { tickets: [], failed: messages };
    }

    const body = await res.json();
    const tickets: Record<string, unknown>[] = body.data ?? [];
    const failed: Record<string, unknown>[] = [];

    tickets.forEach((ticket: Record<string, unknown>, i: number) => {
      if (ticket.status === "error") {
        failed.push({ ...messages[i], error: ticket.message, errorDetail: ticket.details });
      }
    });

    return { tickets, failed };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`Network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES}):`, err);
      await sleep(delay);
      return sendWithRetry(messages, attempt + 1);
    }
    return { tickets: [], failed: messages };
  }
}

async function checkReceipts(
  ticketIds: string[],
  supabase: ReturnType<typeof createClient>
) {
  if (!ticketIds.length) return;

  // Wait before checking receipts (Expo recommends 15+ seconds)
  await sleep(15_000);

  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!res.ok) return;

    const body = await res.json();
    const receipts = body.data ?? {};

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      const r = receipt as Record<string, unknown>;
      if (r.status === "error") {
        console.error(`Receipt error for ${ticketId}:`, r.message, r.details);

        // If token is invalid, remove it from device_tokens
        const details = r.details as Record<string, unknown> | undefined;
        if (details?.error === "DeviceNotRegistered") {
          console.warn("Removing invalid device token");
          // We log this; actual cleanup happens in notification_log processing
        }

        await supabase.from("notification_log").insert({
          ticket_id: ticketId,
          status: "receipt_error",
          error_message: String(r.message ?? ""),
          error_details: r.details ? JSON.stringify(r.details) : null,
        });
      }
    }
  } catch (err) {
    console.warn("Receipt check failed (non-critical):", err);
  }
}

Deno.serve(async (_req) => {
  const t0 = Date.now();
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Find all subscriptions that need a reminder RIGHT NOW ──
    // We query all active/trial subs with reminders enabled and compute
    // which ones are due within the current 5-minute window.
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select(
        "id, user_id, service_name, domain, price, currency, " +
        "reminder_days_before, next_charge_date, reminder_time, " +
        "reminder_enabled, status, reminder_sent_for_period"
      )
      .eq("reminder_enabled", true)
      .in("status", ["active", "trial"])
      .or("reminder_sent_for_period.is.null,reminder_sent_for_period.eq.false");

    if (subsError) throw subsError;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, checked: 0 }), { status: 200 });
    }

    // ── 2. Filter to subscriptions whose reminder time has arrived ──
    const nowUtc = new Date();
    const dueSubs: typeof subs = [];

    for (const sub of subs) {
      // Get user's timezone
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("timezone")
        .eq("user_id", sub.user_id)
        .single();

      const userTz = pref?.timezone || "UTC";

      const remindDate = new Date(sub.next_charge_date + "T00:00:00");
      remindDate.setDate(remindDate.getDate() - (sub.reminder_days_before ?? 1));

      const [hh, mm] = (sub.reminder_time || "09:00").split(":").map(Number);

      // Build the reminder datetime in user's local timezone, then convert to UTC
      // We use Intl to figure out the UTC offset for the user's timezone
      const remindLocalStr =
        `${remindDate.toISOString().split("T")[0]}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;

      // Convert from user's timezone to UTC
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: userTz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      });

      // Find UTC offset by comparing formatted local time with UTC
      let remindUtc: Date;
      try {
        // Create a date assuming it's in the user's timezone
        // Use a temporary date to find the offset
        const tempDate = new Date(remindLocalStr + "Z");
        const utcStr = tempDate.toLocaleString("en-US", { timeZone: "UTC" });
        const localStr = tempDate.toLocaleString("en-US", { timeZone: userTz });
        const utcMs = new Date(utcStr).getTime();
        const localMs = new Date(localStr).getTime();
        const offsetMs = localMs - utcMs;
        remindUtc = new Date(tempDate.getTime() - offsetMs);
      } catch {
        remindUtc = new Date(remindLocalStr + "Z");
      }

      // Check if reminder time has passed (but not more than 24 hours ago)
      const diffMs = nowUtc.getTime() - remindUtc.getTime();
      if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
        dueSubs.push(sub);
      }
    }

    if (!dueSubs.length) {
      return new Response(
        JSON.stringify({ sent: 0, checked: subs.length, due: 0 }),
        { status: 200 }
      );
    }

    // ── 3. Build notification messages ──
    type PushMessage = {
      to: string;
      title: string;
      body: string;
      data: Record<string, string>;
      sound: string;
      mutableContent: boolean;
      _subscriptionId: string;
    };

    const messages: PushMessage[] = [];

    for (const sub of dueSubs) {
      const { data: tokens } = await supabase
        .from("device_tokens")
        .select("token")
        .eq("user_id", sub.user_id);

      if (!tokens?.length) {
        // Log: no device tokens for this user
        await supabase.from("notification_log").insert({
          subscription_id: sub.id,
          user_id: sub.user_id,
          status: "no_device_token",
          error_message: "User has no registered device tokens",
        });
        // Still mark as sent so we don't keep retrying
        await supabase
          .from("subscriptions")
          .update({ reminder_sent_for_period: true })
          .eq("id", sub.id);
        continue;
      }

      const daysBefore = sub.reminder_days_before ?? 1;
      const phrase =
        daysBefore <= 0 ? "today" :
        daysBefore === 1 ? "tomorrow" :
        daysBefore === 7 ? "in 1 week" :
        `in ${daysBefore} days`;

      const amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: sub.currency ?? "USD",
      }).format(sub.price);

      const logoUrl = buildLogoUrl(sub.domain);

      for (const { token } of tokens) {
        messages.push({
          to: token,
          title: "Upcoming charge",
          body: `${sub.service_name} will charge ${amount} ${phrase}.`,
          data: {
            subscriptionId: sub.id,
            serviceName: sub.service_name,
            ...(logoUrl ? { logoUrl } : {}),
          },
          sound: "default",
          mutableContent: true,
          _subscriptionId: sub.id,
        });
      }
    }

    if (!messages.length) {
      return new Response(
        JSON.stringify({ sent: 0, checked: subs.length, due: dueSubs.length }),
        { status: 200 }
      );
    }

    // ── 4. Send in batches with retry ──
    let totalSent = 0;
    const allTicketIds: string[] = [];
    const allFailed: Record<string, unknown>[] = [];
    const sentSubIds = new Set<string>();

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      // Strip internal field before sending
      const expoBatch = batch.map(({ _subscriptionId, ...rest }) => rest);
      const { tickets, failed } = await sendWithRetry(expoBatch);

      tickets.forEach((ticket: Record<string, unknown>) => {
        if (ticket.status === "ok" && ticket.id) {
          allTicketIds.push(ticket.id as string);
        }
      });

      // Track which subscriptions were successfully sent
      batch.forEach((msg, idx) => {
        const ticket = tickets[idx] as Record<string, unknown> | undefined;
        if (ticket?.status === "ok") {
          sentSubIds.add(msg._subscriptionId);
          totalSent++;
        }
      });

      allFailed.push(...failed);
    }

    // ── 5. Mark sent subscriptions ──
    if (sentSubIds.size > 0) {
      await supabase
        .from("subscriptions")
        .update({ reminder_sent_for_period: true })
        .in("id", Array.from(sentSubIds));
    }

    // ── 6. Log failures to dead letter queue ──
    if (allFailed.length > 0) {
      const failRows = allFailed.map((msg) => ({
        subscription_id: (msg as Record<string, unknown>)._subscriptionId || null,
        token: (msg as Record<string, unknown>).to || null,
        status: "send_failed",
        error_message: String((msg as Record<string, unknown>).error ?? "Expo API failure after retries"),
        error_details: (msg as Record<string, unknown>).errorDetail
          ? JSON.stringify((msg as Record<string, unknown>).errorDetail)
          : null,
        payload: JSON.stringify(msg),
      }));
      await supabase.from("notification_log").insert(failRows);
    }

    // ── 7. Check receipts in background ──
    // Don't await — let it run while we return the response
    checkReceipts(allTicketIds, supabase).catch((e) =>
      console.warn("Receipt check error:", e)
    );

    const elapsed = Date.now() - t0;
    return new Response(
      JSON.stringify({
        sent: totalSent,
        failed: allFailed.length,
        checked: subs.length,
        due: dueSubs.length,
        elapsed_ms: elapsed,
      }),
      { status: 200 }
    );
  } catch (e) {
    console.error("send-reminders fatal error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500 }
    );
  }
});
