/**
 * E2E test: full sandbox lifecycle
 * container create → OpenCode server → agent prompt → diff → cleanup
 */

import {
  createSandbox,
  execInContainer,
  extractDiff,
  removeSandbox,
  resetSandbox,
  allocatePort,
  releasePort,
  createSandboxClient,
  waitForServerReady,
  runAgentPrompt,
} from '../src/index.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required. Set it with: export OPENAI_API_KEY=...');
  process.exit(1);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const requestId = `test-${Date.now().toString(36)}`;
  let sandbox = null;

  try {
    // 1. Allocate ports
    console.log('1. Allocating ports...');
    const openCodePort = await allocatePort();
    const vitePort = await allocatePort();
    console.log(`   OpenCode: ${openCodePort}, Vite: ${vitePort}`);

    // 2. Create sandbox
    console.log('2. Creating sandbox container...');
    sandbox = await createSandbox({
      requestId,
      openCodePort,
      vitePort,
      apiKey: OPENAI_API_KEY,
      provider: 'openai',
    });
    console.log(`   Container: ${sandbox.containerName}`);

    // 3. Wait for OpenCode server
    console.log('3. Waiting for OpenCode server...');
    const client = createSandboxClient({ openCodePort: sandbox.openCodePort });
    const health = await waitForServerReady(client);
    console.log(`   Health: ${JSON.stringify(health)}`);

    // 4. Verify container internals
    console.log('4. Verifying container...');
    const nodeCheck = await execInContainer({ containerId: sandbox.containerId, command: 'node --version' });
    console.log(`   Node: ${nodeCheck.stdout.trim()}`);

    // 5. Run agent prompt — create a simple file
    console.log('5. Running agent prompt...');
    const result = await runAgentPrompt(client, {
      prompt: "Create a file at /workspace/msm-portal/test-output.txt with the content: 'sandbox agent works!'",
      provider: 'openai',
      model: 'gpt-4o',
    });

    if (result.error) {
      console.log(`   Agent error: ${result.error.name}: ${result.error.data?.message || ''}`);
    } else {
      console.log(`   Agent success! Cost: $${result.cost}, Tokens: ${JSON.stringify(result.tokens)}`);
      for (const part of result.parts) {
        if (part.type === 'text') {
          console.log(`   Agent says: ${part.text?.slice(0, 200)}`);
        }
      }
    }

    // 6. Check file was created
    console.log('6. Checking agent output...');
    const fileCheck = await execInContainer({
      containerId: sandbox.containerId,
      command: 'cat /workspace/msm-portal/test-output.txt 2>&1',
    });
    console.log(`   File content: ${fileCheck.stdout.trim()}`);

    // 7. Extract diff
    console.log('7. Extracting diff...');
    const diff = await extractDiff({ containerId: sandbox.containerId });
    console.log(`   Changed files: ${diff.changedFiles.join(', ') || '(none)'}`);
    console.log(`   Diff stat: ${diff.diffStat.trim()}`);

    // 8. Test reset (for reject/retry flow)
    console.log('8. Testing reset...');
    await resetSandbox({ containerId: sandbox.containerId });
    const afterReset = await extractDiff({ containerId: sandbox.containerId });
    console.log(`   After reset: ${afterReset.changedFiles.length} changed files (should be 0)`);

    console.log('\n=== E2E TEST PASSED ===');

  } catch (error) {
    console.error('\n=== E2E TEST FAILED ===');
    console.error(error.message);
    console.error(error.stack);
  } finally {
    // 9. Cleanup
    if (sandbox) {
      console.log('9. Cleaning up...');
      await removeSandbox({ containerId: sandbox.containerId });
      releasePort(sandbox.openCodePort);
      releasePort(sandbox.vitePort);
      console.log('   Done.');
    }
  }
}

main();
