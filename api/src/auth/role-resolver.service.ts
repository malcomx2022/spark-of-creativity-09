import { Injectable } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../database/types';

/** Rôles applicatifs — identiques à src/lib/userRoleResolver.ts du front. */
export type AppRole = 'patient' | 'practitioner' | 'coach' | 'admin' | 'incomplete_practitioner';

export interface ResolvedRole {
  role: AppRole;
  source: 'user_roles' | 'practitioners' | 'user_metadata_incomplete' | 'default';
  practitionerType?: string;
  adminRoles: string[];
  practitioner?: { id: string; practitionerType: string | null; kycStatus: string | null; canAcceptMissions: boolean | null };
}

@Injectable()
export class RoleResolverService {
  /**
   * Ordre de priorité conservé : user_roles (admin) → practitioners (coach/praticien)
   * → métadonnées d'inscription (praticien incomplet) → patient par défaut.
   */
  async resolve(db: Kysely<DB> | Transaction<DB>, userId: string, metadata: Record<string, unknown>): Promise<ResolvedRole> {
    const adminRoles = (await db.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute()).map((r) => r.role);
    if (adminRoles.length > 0) return { role: 'admin', source: 'user_roles', adminRoles };

    const practitioner = await db
      .selectFrom('practitioners')
      .select(['id', 'practitioner_type', 'kyc_status', 'can_accept_missions'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (practitioner) {
      const summary = {
        id: practitioner.id,
        practitionerType: practitioner.practitioner_type,
        kycStatus: practitioner.kyc_status,
        canAcceptMissions: practitioner.can_accept_missions,
      };
      return practitioner.practitioner_type === 'coach_sportif'
        ? { role: 'coach', source: 'practitioners', adminRoles, practitioner: summary }
        : { role: 'practitioner', source: 'practitioners', adminRoles, practitioner: summary };
    }

    const userType = metadata['user_type'];
    const practitionerType = metadata['practitioner_type'];
    if (userType === 'practitioner') {
      return { role: 'incomplete_practitioner', source: 'user_metadata_incomplete', practitionerType: String(practitionerType ?? 'unknown'), adminRoles };
    }
    if (userType === 'coach_sportif' || practitionerType === 'coach_sportif') {
      return { role: 'incomplete_practitioner', source: 'user_metadata_incomplete', practitionerType: 'coach_sportif', adminRoles };
    }
    return { role: 'patient', source: 'default', adminRoles };
  }
}
