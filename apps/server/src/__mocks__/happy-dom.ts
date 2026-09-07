// Jest mock for happy-dom — the real package is ESM-only (`"type": "module"`)
// and cannot be loaded by the CommonJS unit-test runner. Unit specs never
// render HTML through it; they only need the modules that import it
// (common/helpers/prosemirror/html/*) to load.

export class Window {
  document = {} as any;
  happyDOM = { abort: jest.fn(), close: jest.fn() };
  DOMParser = class {
    parseFromString = jest.fn();
  };
  XMLSerializer = class {
    serializeToString = jest.fn().mockReturnValue('');
  };
}
