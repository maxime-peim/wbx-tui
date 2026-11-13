/** Handshake assertions only. RPC parsing/admission remains independently closed. */
import catalogue from './editor-features.json' with { type: 'json' };

export function editorFeatures(): { capabilities: string[] } & Record<string, string[]> {
  return { capabilities: [...catalogue.capabilities], ...Object.fromEntries(
    Object.entries(catalogue.features).map(([field, variants]) => [field, Object.keys(variants)])) };
}
