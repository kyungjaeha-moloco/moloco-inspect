#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  return await response.json();
}

async function main() {
  const server = getArg('--server', 'http://localhost:3847');
  const component = getArg('--component');
  const file = getArg('--file');
  const prompt = getArg('--prompt');
  const line = Number(getArg('--line', '1'));
  const pageUrl = getArg('--page-url');
  const pagePath = getArg('--page-path');
  const approve = hasFlag('--approve');
  const expectFile = getArg('--expect-file');
  const expectPattern = getArg('--expect-pattern');
  const expectScreenshot = hasFlag('--expect-screenshot');
  const timeoutMs = Number(getArg('--timeout-ms', '120000'));
  const pollMs = Number(getArg('--poll-ms', '2000'));

  if (!component || !file || !prompt) {
    console.error('Missing required args: --component, --file, --prompt');
    process.exit(1);
  }

  const request = await postJson(`${server}/api/change-request`, {
    component,
    file,
    line,
    pageUrl,
    pagePath,
    userPrompt: prompt,
  });

  if (!request.id) {
    console.error('Failed to create request:', request);
    process.exit(1);
  }

  console.log(`request_id=${request.id}`);

  const start = Date.now();
  let lastStatus = null;

  while (Date.now() - start < timeoutMs) {
    const status = await getJson(`${server}/api/status/${request.id}`);
    if (status.status !== lastStatus) {
      console.log(`status=${status.status} phase=${status.phase}`);
      lastStatus = status.status;
    }

    if (status.latestLog) {
      console.log(`latest=${String(status.latestLog).split('\n')[0]}`);
    }

    if (status.status === 'preview') {
      console.log('preview_ready=true');
      if (expectScreenshot) {
        if (!status.screenshotUrl) {
          console.error('Expected screenshotUrl in preview status');
          process.exit(1);
        }
        const screenshotResponse = await fetch(`${server}${status.screenshotUrl}`, { method: 'HEAD' });
        if (!screenshotResponse.ok) {
          console.error(`Screenshot fetch failed: ${screenshotResponse.status}`);
          process.exit(1);
        }
        console.log(`screenshot_ready=${status.screenshotUrl}`);
      }
      if (approve) {
        const approval = await postJson(`${server}/api/approve/${request.id}`, {});
        console.log(`approve_status=${approval.status}`);
        if (approval.error) {
          console.error(approval.error);
          process.exit(1);
        }
      }

      if (expectFile && expectPattern) {
        const resolved = path.resolve(expectFile);
        const content = fs.readFileSync(resolved, 'utf-8');
        if (!content.includes(expectPattern)) {
          console.error(`Expected pattern not found: ${expectPattern}`);
          process.exit(1);
        }
        console.log(`expectation_passed=${expectPattern}`);
      }
      process.exit(0);
    }

    if (status.status === 'approved') {
      if (expectFile && expectPattern) {
        const resolved = path.resolve(expectFile);
        const content = fs.readFileSync(resolved, 'utf-8');
        if (!content.includes(expectPattern)) {
          console.error(`Expected pattern not found: ${expectPattern}`);
          process.exit(1);
        }
        console.log(`expectation_passed=${expectPattern}`);
      }
      process.exit(0);
    }

    if (status.status === 'error') {
      console.error(`error_phase=${status.phase}`);
      console.error(status.error || 'unknown error');
      process.exit(1);
    }

    await sleep(pollMs);
  }

  console.error(`Timed out after ${timeoutMs}ms`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
