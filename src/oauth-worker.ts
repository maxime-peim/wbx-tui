import { SharedOAuthOwner } from './oauth-share.js';
import type { OAuthSeed } from './oauth.js';

let owner: SharedOAuthOwner | undefined;
const timer = setTimeout(() => process.exit(1), 5000);
process.once('message', (seed: OAuthSeed) => {
  clearTimeout(timer);
  void SharedOAuthOwner.open(seed).then(value => {
    owner = value; owner.onClose = () => process.exit(0);
    process.send?.({ path: owner.path });
  }).catch(() => process.exit(1));
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, () => { if (owner) void owner.close(); else process.exit(0); });
