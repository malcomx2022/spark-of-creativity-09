import { SetMetadata } from '@nestjs/common';
import type { AppRoleDb } from '../../database/types';

export const ADMIN_ROLES_KEY = 'adminRoles';
export type AdminRole = Extract<AppRoleDb, 'super_admin' | 'ops' | 'finance' | 'compliance' | 'support' | 'analyst'>;

/** Exige que l'utilisateur possède l'un des rôles administrateurs listés (table user_roles).
 *  Sans argument : n'importe quel rôle administrateur (équivalent de is_admin()). */
export const AdminOnly = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
