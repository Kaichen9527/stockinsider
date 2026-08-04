'use strict';

const crypto = require('node:crypto');
const { RunnerError } = require('./artifacts');

function parseJsonWithNoDuplicateKeys(input) {
  let index = 0;
  function whitespace() {
    while (index < input.length && /[\t\n\r ]/.test(input[index])) index += 1;
  }
  function string() {
    const start = index;
    if (input[index] !== '"') throw new SyntaxError('expected string');
    index += 1;
    while (index < input.length) {
      const character = input[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(input.slice(start, index));
      }
      if (character === '\\') {
        index += 1;
        if (index >= input.length) throw new SyntaxError('unterminated escape');
        if (input[index] === 'u') {
          const hex = input.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError('bad unicode escape');
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/.test(input[index])) throw new SyntaxError('bad escape');
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) throw new SyntaxError('control character');
      index += 1;
    }
    throw new SyntaxError('unterminated string');
  }
  function value() {
    whitespace();
    const current = input[index];
    if (current === '"') return string();
    if (current === '{') {
      index += 1;
      whitespace();
      const output = Object.create(null);
      const keys = new Set();
      if (input[index] === '}') {
        index += 1;
        return output;
      }
      while (true) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new SyntaxError('duplicate key');
        keys.add(key);
        whitespace();
        if (input[index] !== ':') throw new SyntaxError('missing colon');
        index += 1;
        output[key] = value();
        whitespace();
        if (input[index] === '}') {
          index += 1;
          return output;
        }
        if (input[index] !== ',') throw new SyntaxError('missing comma');
        index += 1;
      }
    }
    if (current === '[') {
      index += 1;
      whitespace();
      const output = [];
      if (input[index] === ']') {
        index += 1;
        return output;
      }
      while (true) {
        output.push(value());
        whitespace();
        if (input[index] === ']') {
          index += 1;
          return output;
        }
        if (input[index] !== ',') throw new SyntaxError('missing comma');
        index += 1;
      }
    }
    for (const literal of ['true', 'false', 'null']) {
      if (input.startsWith(literal, index)) {
        index += literal.length;
        return literal === 'true' ? true : literal === 'false' ? false : null;
      }
    }
    const match = input.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) throw new SyntaxError('invalid JSON value');
    index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) throw new SyntaxError('non-finite number');
    return number;
  }
  const result = value();
  whitespace();
  if (index !== input.length) throw new SyntaxError('trailing content');
  return result;
}

function validScalarString(value) {
  if (value.normalize('NFC') !== value) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (!validScalarString(value)) throw new RunnerError(3, 'invalid unicode');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new RunnerError(3, 'invalid number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== null && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RunnerError(3, 'invalid value');
  }
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (!validScalarString(key) || value[key] === undefined) throw new RunnerError(3, 'invalid object');
  }
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

module.exports = { parseJsonWithNoDuplicateKeys, canonicalJson, sha256, validScalarString };
