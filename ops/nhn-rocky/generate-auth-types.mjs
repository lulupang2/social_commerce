#!/usr/bin/env node
// The OpenAPI document uses JSON syntax (a valid YAML subset). No dependency or
// globally installed generator is required. Unsupported schema forms fail closed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const document = JSON.parse(readFileSync(resolve(root, 'apps/api/openapi.yaml'), 'utf8'));
if (document.openapi !== '3.1.0') throw new Error('Expected OpenAPI 3.1.0');
const schemas = document.components.schemas;
function render(schema) {
  if (schema.oneOf) return schema.oneOf.map(value => `(${render(value)})`).join(' | ');
  if (schema.$ref) {
    const name = schema.$ref.replace('#/components/schemas/', '');
    if (!Object.hasOwn(schemas, name)) throw new Error('Unknown local schema reference');
    return name;
  }
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map(type => render({ ...schema, type })).join(' | ');
  if (schema.type === 'null') return 'null';
  if (['string', 'boolean', 'number'].includes(schema.type)) return schema.type;
  if (schema.type === 'integer') return 'number';
  if (schema.type === 'array') return `Array<${render(schema.items)}>`;
  if (schema.type === 'object' && schema.additionalProperties === true) return 'Record<string, unknown>';
  if (schema.type === 'object' && schema.additionalProperties === false) {
    return '{\n' + Object.entries(schema.properties).map(([name, value]) => `  ${JSON.stringify(name)}${schema.required?.includes(name) ? '' : '?'}: ${render(value)};`).join('\n') + '\n}';
  }
  throw new Error('Unsupported OpenAPI schema; extend the generator explicitly');
}
const generated = '// Generated from apps/api/openapi.yaml. Do not edit by hand.\n' +
  '// Regenerate: node ops/nhn-rocky/generate-auth-types.mjs\n\n' +
  Object.entries(schemas).map(([name, schema]) => `export type ${name} = ${render(schema)};\n`).join('\n');
const target = resolve(root, 'apps/web/lib/go-auth/schema.generated.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== generated) throw new Error('Generated Go-auth types are stale');
  console.log('PASS: OpenAPI-generated Go-auth types are current');
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, generated);
  console.log('Generated Go-auth types from OpenAPI');
}
