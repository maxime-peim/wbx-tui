/** Pure parser-to-native fixture. No transport, services, files, SDK or actions. */
import { parseMessage } from '../src/messaging-api.js';
const base = { roomId: 'room', personId: 'person', personEmail: 'Label', created: '2026-11-15T10:00:00.000Z' };
const messages = [
  parseMessage({ ...base, id: 'ordinary', text: '[Adaptive Card 1.3] this ordinary text must not become card metadata' }, 'room'),
  parseMessage({ ...base, id: 'card', created: '2026-11-15T10:01:00.000Z', text: 'Fallback',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
      type: 'AdaptiveCard', version: '1.3', body: [
        { type: 'TextBlock', text: ':let g:card_pwned = 1' },
        { type: 'FactSet', facts: [{ title: 'Owner', value: 'Same Name' }] },
      ],
    } }],
  }, 'room'),
];
process.stdout.write(JSON.stringify(messages) + '\n');
