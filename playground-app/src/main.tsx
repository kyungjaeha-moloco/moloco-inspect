import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { migrateV1ToV2 } from './services/migrate-v1-to-v2';
import { migrateV2ToV3 } from './services/migrate-v2-to-v3';
import './shared-ui/tokens.css';

async function bootstrap() {
  await migrateV1ToV2();
  await migrateV2ToV3();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

bootstrap().catch((err) => {
  console.error('[bootstrap] Failed to start app:', err);
  document.getElementById('root')!.textContent = 'Failed to start the app. Check the console.';
});
