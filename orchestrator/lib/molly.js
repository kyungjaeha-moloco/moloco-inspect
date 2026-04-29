/**
 * molly — Slack bot entry point for Inspect.
 *
 * Phase 1 (this file): echo + 👀 reaction. Confirms wiring is correct
 * (Socket Mode connects, OAuth scopes are right, channel whitelist
 * works). Once Phase 1 is verified, the `app_mention` handler grows
 * into:
 *   - Phase 2: quick change-request (one-shot ad-hoc edit)
 *   - Phase 3: PRD job with interactive plan-approval buttons
 *
 * Disabled-by-default: if any of the three required tokens is missing,
 * `startMolly` returns early with a single log line. Orchestrator boot
 * is unaffected — Slack is a feature, not a hard dependency.
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN      — xoxb-... (Bot User OAuth Token)
 *   SLACK_APP_TOKEN      — xapp-1-... (App-Level Token, connections:write)
 *   SLACK_SIGNING_SECRET — (32-char hex, from Basic Information)
 *
 * Optional:
 *   INSPECT_SLACK_CHANNEL — restrict mentions to a single channel ID.
 *                           Empty = any channel molly is invited to.
 */

import bolt from '@slack/bolt';

const { App } = bolt;

/** @type {bolt.App | null} */
let appInstance = null;

export function startMolly() {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !appToken || !signingSecret) {
    console.log('[molly] tokens not set — bot disabled');
    return;
  }

  const allowedChannel = process.env.INSPECT_SLACK_CHANNEL?.trim() || null;

  appInstance = new App({
    token: botToken,
    appToken,
    signingSecret,
    socketMode: true,
  });

  appInstance.event('app_mention', async ({ event, client, say, logger }) => {
    // Channel whitelist — bail silently so misdirected mentions don't
    // generate noise in unrelated channels (and don't tip off users
    // that the bot heard them).
    if (allowedChannel && event.channel !== allowedChannel) {
      logger.info(
        `[molly] mention ignored: channel=${event.channel} not whitelisted`,
      );
      return;
    }

    // Strip the leading <@U0XXX> mention so we get the actual user
    // intent. Slack delivers mentions as "<@BOTID> hello" — we want
    // just "hello".
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    // Phase 1: 👀 reaction (immediate ack — Slack expects <3s).
    try {
      await client.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: 'eyes',
      });
    } catch (err) {
      // Already-reacted is fine; other errors are logged but don't
      // block the thread reply.
      logger.warn(`[molly] reaction failed: ${err.message}`);
    }

    // Phase 1: thread reply with what we received. Threading on
    // event.ts (or existing thread_ts if mention was inside a thread)
    // keeps molly's noise isolated from the channel scrollback.
    const threadTs = event.thread_ts ?? event.ts;
    const display = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    await say({
      thread_ts: threadTs,
      text: display
        ? `👋 안녕하세요! 받은 요청:\n\`\`\`\n${display}\n\`\`\``
        : '👋 안녕하세요! 어떤 작업을 해드릴까요?',
    });

    logger.info(
      `[molly] mention: user=${event.user} channel=${event.channel} text=${JSON.stringify(text.slice(0, 80))}`,
    );

    // Phase 2 will branch here: quick change-request vs PRD job.
    // Phase 3 will add interactive buttons (plan approve, QA pass).
  });

  appInstance.error(async (err) => {
    console.error('[molly] error:', err);
  });

  appInstance
    .start()
    .then(() => {
      console.log(
        `[molly] ⚡️ listening (Socket Mode${
          allowedChannel ? `, channel=${allowedChannel}` : ', any channel'
        })`,
      );
    })
    .catch((err) => {
      console.error('[molly] failed to start:', err.message);
      appInstance = null;
    });
}

/**
 * Graceful shutdown — used by tests and by the orchestrator's
 * SIGTERM handler if we wire one. Currently a no-op for callers
 * that don't await.
 */
export async function stopMolly() {
  if (!appInstance) return;
  try {
    await appInstance.stop();
  } catch (err) {
    console.warn('[molly] stop error:', err.message);
  } finally {
    appInstance = null;
  }
}
