/**
 * ConqrHub — Conqr platform integration.
 *
 * The ConqrAccess-application-grant to ConqrHub-workspace-role mapping.
 *
 * The requirement ids are the ones the ConqrService canary established, because these are the same
 * requirements applied to a second product. If the platform is reusable, the same list should be
 * provable here with nothing new invented — and where a requirement does not apply, that should be
 * visible rather than silently absent.
 */
import {
  APPLICATION_ID,
  KNOWN_APPLICATION_ROLES,
  NOT_REACHABLE_FROM_PLATFORM,
  TENANT_ROLES_CONFER_NOTHING,
  mapApplicationRoles,
} from './role-map';
import { UserRole } from '../../common/helpers/types/permission';

describe('mapApplicationRoles', () => {
  describe('G-01 — tenant membership is not product authority', () => {
    it.each(TENANT_ROLES_CONFER_NOTHING)('G01-01/02/03 grants nothing for %s', (tenantRole) => {
      expect(mapApplicationRoles([tenantRole])).toBeNull();
    });

    it('G01-01/02/03 grants nothing for every tenant role held at once', () => {
      expect(mapApplicationRoles(TENANT_ROLES_CONFER_NOTHING)).toBeNull();
    });

    it('G01-01/02/03 does not let a tenant role widen an explicit application grant', () => {
      expect(mapApplicationRoles(['tenant.owner', 'conqrhub.member'])).toBe(UserRole.MEMBER);
      expect(mapApplicationRoles(['tenant.admin', 'conqrhub.member'])).toBe(
        mapApplicationRoles(['conqrhub.member']),
      );
    });
  });

  describe('explicit application grants', () => {
    it('G01-04 maps an explicit member grant to a workspace member', () => {
      expect(mapApplicationRoles(['conqrhub.member'])).toBe(UserRole.MEMBER);
    });

    it('G01-05 maps an explicit admin grant to a workspace admin', () => {
      expect(mapApplicationRoles(['conqrhub.admin'])).toBe(UserRole.ADMIN);
    });

    it('G01-06 maps an explicit owner grant to a workspace owner', () => {
      expect(mapApplicationRoles(['conqrhub.owner'])).toBe(UserRole.OWNER);
    });

    it('G01-06 resolves several grants to the strongest, deterministically', () => {
      expect(mapApplicationRoles(['conqrhub.member', 'conqrhub.owner'])).toBe(UserRole.OWNER);
      expect(mapApplicationRoles(['conqrhub.owner', 'conqrhub.member'])).toBe(UserRole.OWNER);
      expect(mapApplicationRoles(['conqrhub.member', 'conqrhub.admin'])).toBe(UserRole.ADMIN);
    });
  });

  describe('fail closed', () => {
    it('G01-08 gives an unknown application role nothing at all', () => {
      // Null, not MEMBER. A permissive default is how a role the platform adds tomorrow becomes
      // access nobody granted.
      expect(mapApplicationRoles(['conqrhub.superuser', 'something.new'])).toBeNull();
    });

    it('G01-08 grants nothing for an empty or absent grant list', () => {
      expect(mapApplicationRoles([])).toBeNull();
    });

    it('G01-08 reads nothing but the application grants it is given', () => {
      // A ZITADEL claim, an e-mail domain, a home organization or one of this product's own role
      // strings are not inputs.
      expect(mapApplicationRoles(['owner'])).toBeNull();
      expect(mapApplicationRoles(['admin'])).toBeNull();
      expect(mapApplicationRoles(['member'])).toBeNull();
      expect(mapApplicationRoles(['ConqrAI'])).toBeNull();
      expect(mapApplicationRoles(['person@conqrai.com'])).toBeNull();
    });

    it('G01-10 grants nothing for another application-s roles', () => {
      expect(mapApplicationRoles(['conqrservice.admin', 'conqrplan.admin'])).toBeNull();
    });

    it('G01-10 every known application role belongs to this application', () => {
      for (const role of KNOWN_APPLICATION_ROLES) {
        expect(role.startsWith(`${APPLICATION_ID}.`)).toBe(true);
      }
    });

    it('G01-06 never confers space or page access, which is granted per resource', () => {
      // The strongest grant the platform can make is a workspace role. Space membership and page
      // permissions are relationships this product owns, and no platform grant manufactures one.
      const strongest = mapApplicationRoles(KNOWN_APPLICATION_ROLES);
      expect(strongest).toBe(UserRole.OWNER);
      for (const resourceRole of NOT_REACHABLE_FROM_PLATFORM) {
        expect(Object.values(UserRole) as string[]).not.toContain(resourceRole);
      }
    });
  });
});
