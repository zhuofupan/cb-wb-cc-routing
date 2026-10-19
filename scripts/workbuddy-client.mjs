// Reuse the DSH plugin's maintained authentication and upstream implementation.
import { WorkBuddyCredentialStore } from './dsh-workbuddy-connect/src/auth.ts';
import { WorkBuddyUpstreamClient } from './dsh-workbuddy-connect/src/upstream.ts';
import { CN_VARIANT } from './dsh-workbuddy-connect/src/variants.ts';
import { fileURLToPath } from 'node:url';

export const client = new WorkBuddyUpstreamClient();
export const store = new WorkBuddyCredentialStore({
  variant: CN_VARIANT,
  ownPath: fileURLToPath(new URL('./workbuddy-auth.json', import.meta.url)),
  refresh: credential => client.refresh(credential),
});

if (process.argv.includes('--check')) {
  try {
    const credential = await store.resolve();
    const models = await client.fetchModels(credential);
    console.log(JSON.stringify({ authenticated: true, models }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ authenticated: false, error: error.message }));
    process.exitCode = 1;
  }
}
