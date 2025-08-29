'use strict';

/**
 * Basit schema tanımı + validasyon:
 *  - fields: { name: { type: 'String'|'ID'|'Boolean'|'Int'|'Float'|'Date', required?: true } }
 *  - version: number
 *  - type: dokümandaki 'type' alanının sabit değeri (koleksiyon tipi işareti)
 */

const SCHEMAS = {
  courses: {
    type: 'course',
    version: 1,
    fields: {
      id: { type: 'ID', required: true, pattern: '^\\d{2}$' }, // iki haneli id: "01","09","13" vb.
      type: { type: 'String', required: true }, // 'course'
      schemaVersion: { type: 'Int' },
      createdAt: { type: 'Date' },
      updatedAt: { type: 'Date' },
      code: { type: 'String', required: true },
      name: { type: 'String', required: true },
      level: { type: 'String', required: true }, // TYT / AYT
      // topics: liste halinde nesneler -> her bir num iki haneli string, title string
      topics: {
        type: '[Object]',
        required: true,
        schema: {
          num: { type: 'String', required: true, pattern: '^\\d{2}$' },
          title: { type: 'String', required: true }
        }
      }
    }
  },
};

function validateDoc(schema, doc) {
  // type + version
  if (doc.type !== schema.type) return `type must be "${schema.type}"`;
  if (doc.schemaVersion !== schema.version) return `schemaVersion must be ${schema.version}`;

  for (const [field, rules] of Object.entries(schema.fields)) {
    const val = doc[field];
    if (rules.required && (val === undefined || val === null || val === '')) {
      return `field "${field}" is required`;
    }
    if (val === undefined || val === null) continue;
    if (!typeCheck(rules.type, val)) {
      return `field "${field}" expected ${rules.type} but got ${typeof val}`;
    }
  }
  return null;
}

function typeCheck(typeStr, val) {
  if (typeStr === 'ID' || typeStr === 'String') return typeof val === 'string';
  if (typeStr === 'Boolean') return typeof val === 'boolean';
  if (typeStr === 'Int') return Number.isInteger(val);
  if (typeStr === 'Float') return typeof val === 'number';
  if (typeStr === 'Date') return typeof val === 'string' && !Number.isNaN(Date.parse(val));
  const listMatch = /^\[(.+)\]$/.exec(typeStr);
  if (listMatch) {
    if (!Array.isArray(val)) return false;
    const inner = listMatch[1];
    return val.every(v => typeCheck(inner, v));
  }
  return true; // fallback
}

module.exports = { SCHEMAS, validateDoc };
