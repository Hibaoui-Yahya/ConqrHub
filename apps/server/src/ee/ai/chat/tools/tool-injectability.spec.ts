import 'reflect-metadata';

// PageService drags in the ProseMirror helpers, which load happy-dom as ESM
// and cannot be parsed by this Jest config. Only the tool classes matter
// here, so the heavy dependency is stubbed exactly as the other specs in
// this directory do.
jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('../../../../collaboration/collaboration.util', () => ({
  jsonToText: jest.fn(),
}));

import { PLANE_CRUD_TOOLS } from './plane-crud.tools';
import { PLANE_PROJECT_TOOLS } from './plane-project.tools';
import { PLANE_WORK_ITEM_TOOLS } from './plane-work-items.tools';
import { PLANE_WORK_MANAGEMENT_TOOLS } from './plane-work-management.tools';
import { PLANE_CONTROL_TOOLS } from './plane-control.tools';
import { SUITE_INTEGRATION_TOOLS } from './suite-integration.tools';
import { VERIFICATION_LIFECYCLE_TOOLS } from './verification-lifecycle.tools';

/**
 * Guard against a whole class of outage rather than one bug.
 *
 * Every other spec in this directory constructs a tool with
 * `new Tool(depA, depB, depC)`, which hands the dependencies over directly.
 * That path cannot fail, so it proves nothing about the path Nest actually
 * uses: reading `design:paramtypes` off the class and resolving each entry.
 *
 * TypeScript only emits that metadata for a class that declares its own
 * constructor. A shared abstract base therefore leaves every subclass with
 * none, Nest injects nothing, and the first `onModuleInit` dereferences
 * undefined — during bootstrap, so the application never finishes starting
 * and every request 502s. That happened; 235 green unit tests did not notice.
 */

const TOOL_GROUPS: Record<string, readonly unknown[]> = {
  'plane-crud.tools': PLANE_CRUD_TOOLS,
  'plane-project.tools': PLANE_PROJECT_TOOLS,
  'plane-work-items.tools': PLANE_WORK_ITEM_TOOLS,
  'plane-work-management.tools': PLANE_WORK_MANAGEMENT_TOOLS,
  'plane-control.tools': PLANE_CONTROL_TOOLS,
  'suite-integration.tools': SUITE_INTEGRATION_TOOLS,
  'verification-lifecycle.tools': VERIFICATION_LIFECYCLE_TOOLS,
};

describe('tool classes are injectable by Nest', () => {
  for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
    describe(group, () => {
      it('exports at least one tool', () => {
        expect(tools.length).toBeGreaterThan(0);
      });

      it.each(tools.map((t) => [(t as new (...a: any[]) => unknown).name, t]))(
        '%s declares its own constructor parameter metadata',
        (_name, tool) => {
          const target = tool as new (...args: any[]) => unknown;
          const paramTypes = Reflect.getOwnMetadata('design:paramtypes', target);

          // getOwnMetadata, not getMetadata: an inherited entry is exactly the
          // failure mode here. The subclass must carry its own.
          expect(paramTypes).toBeDefined();
          expect(Array.isArray(paramTypes)).toBe(true);
          expect((paramTypes as unknown[]).length).toBe(target.length);
          expect((paramTypes as unknown[]).length).toBeGreaterThan(0);

          // Every parameter must resolve to a real class. `undefined` here is
          // an unresolvable token, which Nest reports only at runtime.
          for (const t of paramTypes as unknown[]) {
            expect(typeof t).toBe('function');
          }
        },
      );
    });
  }

  it('no tool inherits its constructor from a shared base', () => {
    const inheriting: string[] = [];
    for (const tools of Object.values(TOOL_GROUPS)) {
      for (const tool of tools) {
        const target = tool as new (...args: any[]) => unknown;
        const own = Reflect.getOwnMetadata('design:paramtypes', target);
        const parent = Object.getPrototypeOf(target);
        // A base class that is itself a constructor with parameters is the
        // shape that silently removes a subclass's metadata.
        if (!own && typeof parent === 'function' && parent.length > 0) {
          inheriting.push(target.name);
        }
      }
    }
    expect(inheriting).toEqual([]);
  });
});
