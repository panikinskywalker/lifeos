import { describe, expect, it } from 'vitest';
import { BILL_SCHEMA } from './quickAdd';
import { STATEMENT_SCHEMA } from './statementRead';
import { receiptQuestion } from './bills';

/**
 * Claude's structured answers (output_config.format) refuse a schema with an
 * object that does not say additionalProperties: false, before reading the
 * photo. A trip's receipt failed this way (18 Nov).
 */
function openObjects(s: unknown, path = '$'): string[] {
  if (!s || typeof s !== 'object') return [];
  const o = s as Record<string, unknown>;
  const here = o.type === 'object' && o.additionalProperties !== false ? [path] : [];
  const props = Object.entries((o.properties ?? {}) as Record<string, unknown>).flatMap(([k, v]) => openObjects(v, `${path}.${k}`));
  return [...here, ...props, ...openObjects(o.items, `${path}[]`)];
}

describe('the schemas photos are read with', () => {
  it('close every object, so Claude accepts them', () => {
    expect(openObjects(BILL_SCHEMA)).toEqual([]);
    expect(openObjects(STATEMENT_SCHEMA)).toEqual([]);
    expect(openObjects(receiptQuestion(['You', 'Rushikesh']).schema)).toEqual([]);
  });
});
