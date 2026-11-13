/** Read-only inventory/trace checker. Coverage links are evidence pointers, not branch-coverage claims. */
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Inventory { fields: string[]; methods: string[]; moduleFunctions: string[] }
interface Reference { file: string; contains: string }
interface Responsibility {
  id: string; source: string; owner: string; decision: string; reason: string;
  fields: { names: string[]; lifetime: string }[]; methods: string[]; moduleFunctions?: string[];
  invalidation: string[]; trace: Reference[]; failure: string;
  positive: Reference[]; recovery: Reference[]; limits: string[]; checklist: string[];
}
interface Audit {
  version: number; scope: string; sources: { path: string; class: string | null }[];
  responsibilities: Responsibility[];
  projectionFamilies: { owner: string; fields: string[]; rule: string }[];
  checklist: { id: string; kind: string; status: string; owner: string; finding: string; evidence: Reference[]; exit: string }[];
}
export function typescriptInventory(path: string, text: string, className: string): Inventory {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const cls = file.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === className);
  if (!cls) throw Error(`Missing coordinator class: ${className}`);
  const fields: string[] = [], methods: string[] = [];
  for (const member of cls.members) {
    if (ts.isPropertyDeclaration(member)) fields.push(member.name.getText(file));
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member))
      methods.push(member.name.getText(file));
    if (ts.isConstructorDeclaration(member)) {
      methods.push('constructor');
      for (const parameter of member.parameters)
        if (parameter.modifiers?.some(modifier => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.PublicKeyword,
          ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(modifier.kind)))
          fields.push(parameter.name.getText(file));
    }
  }
  return { fields, methods, moduleFunctions: file.statements.filter(ts.isFunctionDeclaration).map(node => node.name!.text) };
}
export function vimInventory(text: string): Inventory {
  const fields = new Set<string>(), methods: string[] = [];
  for (const line of text.split('\n')) {
    const method = /^function! ([^(]+)/.exec(line);
    if (method) methods.push(method[1]!);
    // Include assignments within functions too: a new hidden script/global
    // binding must not evade the audit by moving its declaration into a callback.
    for (const match of line.matchAll(/\blet\s+((?:s:|g:)\w+)(?=\s*(?:=|\+=|\.))/g)) fields.add(match[1]!);
  }
  return { fields: [...fields], methods, moduleFunctions: [] };
}
export function partitionErrors(actual: Inventory, groups: Responsibility[]): string[] {
  const expected = {
    fields: groups.flatMap(group => group.fields.flatMap(field => field.names)),
    methods: groups.flatMap(group => group.methods),
    moduleFunctions: groups.flatMap(group => group.moduleFunctions ?? []),
  };
  const errors: string[] = [];
  for (const kind of ['fields', 'methods', 'moduleFunctions'] as const) {
    for (const name of expected[kind])
      if (expected[kind].filter(value => value === name).length !== 1) errors.push(`Duplicate ${kind}: ${name}`);
    for (const name of actual[kind]) if (!expected[kind].includes(name)) errors.push(`Unmapped ${kind}: ${name}`);
    for (const name of expected[kind]) if (!actual[kind].includes(name)) errors.push(`Stale ${kind}: ${name}`);
  }
  return [...new Set(errors)];
}
function snapshotFields(root: string): string[] {
  const path = resolve(root, 'src/editor-engine.ts');
  const program = ts.createProgram([path], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const file = program.getSourceFile(path)!;
  const cls = file.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'EditorEngine')!;
  const method = cls.members.find((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(file) === 'snapshot')!;
  const checker = program.getTypeChecker(), signature = checker.getSignatureFromDeclaration(method)!;
  return checker.getReturnTypeOfSignature(signature).getProperties().map(property => property.name).sort();
}
export async function auditCoordinators(root = process.cwd()) {
  const data = JSON.parse(await readFile(resolve(root, 'docs/coordinator-audit.json'), 'utf8')) as Audit;
  const errors: string[] = [], inventory: Record<string, Inventory> = {}, ids = new Set<string>();
  const texts = new Map<string, string>();
  const text = async (path: string) => {
    if (!texts.has(path)) texts.set(path, await readFile(resolve(root, path), 'utf8'));
    return texts.get(path)!;
  };
  for (const source of data.sources) {
    inventory[source.path] = source.class ? typescriptInventory(source.path, await text(source.path), source.class)
      : vimInventory(await text(source.path));
    errors.push(...partitionErrors(inventory[source.path]!, data.responsibilities.filter(group => group.source === source.path))
      .map(error => `${source.path}: ${error}`));
  }
  const checkReference = async (reference: Reference, label: string) => {
    if (!reference.file || !reference.contains || reference.file.startsWith('/') || reference.file.includes('..')) {
      errors.push(`${label}: invalid local evidence reference`); return;
    }
    try { if (!(await text(reference.file)).includes(reference.contains)) errors.push(`${label}: missing anchor ${reference.file}: ${reference.contains}`); }
    catch { errors.push(`${label}: missing file ${reference.file}`); }
  };
  const checklist = new Set(data.checklist.map(item => item.id));
  if (checklist.size !== data.checklist.length) errors.push('Duplicate checklist ID');
  for (const group of data.responsibilities) {
    if (ids.has(group.id)) errors.push(`Duplicate responsibility: ${group.id}`); ids.add(group.id);
    if (!data.sources.some(source => source.path === group.source)) errors.push(`${group.id}: unknown source`);
    if (!group.owner || !group.reason || !group.failure || !['keep', 'review'].includes(group.decision)
      || !group.invalidation.length || !group.trace.length) errors.push(`${group.id}: incomplete ownership/invalidation/failure decision`);
    if (group.fields.some(field => !field.lifetime || !field.names.length)) errors.push(`${group.id}: missing field lifetime`);
    if ((!group.positive.length || !group.recovery.length) && !group.checklist.length) errors.push(`${group.id}: missing coverage must be a finite checklist item`);
    for (const item of group.checklist) if (!checklist.has(item)) errors.push(`${group.id}: unknown gap ${item}`);
    for (const reference of [...group.trace, ...group.positive, ...group.recovery]) await checkReference(reference, group.id);
  }
  for (const item of data.checklist) {
    if (!item.finding || !item.owner || !item.exit || !item.evidence.length
      || !['confirmed-defect', 'coverage-gap', 'external-acceptance'].includes(item.kind)
      || !['open', 'not-run', 'closed'].includes(item.status)) errors.push(`${item.id}: incomplete finite exit condition`);
    if (!data.responsibilities.some(group => group.checklist.includes(item.id))) errors.push(`${item.id}: orphan checklist item`);
    for (const reference of item.evidence) await checkReference(reference, item.id);
  }
  const projected = data.projectionFamilies.flatMap(group => group.fields).sort(), snapshot = snapshotFields(root);
  for (const group of data.projectionFamilies)
    if (!ids.has(group.owner) || !group.rule) errors.push(`Unknown projection owner/rule: ${group.owner}`);
  if (JSON.stringify(projected) !== JSON.stringify(snapshot)) errors.push(`Snapshot partition differs: declared=${projected.join(',')} actual=${snapshot.join(',')}`);
  return {
    scope: data.scope, responsibilities: data.responsibilities.length,
    inventory: Object.fromEntries(Object.entries(inventory).map(([path, value]) => [path, {
      fields: value.fields.length, methods: value.methods.length, moduleFunctions: value.moduleFunctions.length,
    }])),
    projectedFields: snapshot.length,
    checklist: data.checklist.map(({ id, kind, status }) => ({ id, kind, status })),
    errors, limitations: 'Exact inventory/anchor completeness is checked; curated semantics and linked tests are not inferred branch coverage or live acceptance.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await auditCoordinators(); console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
