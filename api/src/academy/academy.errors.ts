import { BadGatewayException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AkambiError } from './akambi.client';

/**
 * Erreurs Akambi converties en réponses DomiCares (guide § 11). Le corps suit la forme des autres erreurs
 * métier de l'API ({ statusCode, error, message }) : `error` porte un code stable exploitable par le front.
 * Le message d'Akambi n'est jamais repris (il peut contenir l'e-mail ou le nom de l'apprenant).
 */
const CONFLICTS: Record<string, string> = {
  LEARNER_EMAIL_MISMATCH: 'Votre adresse e-mail DomiCares a changé depuis votre inscription à l’Academy. Contactez le support pour mettre à jour votre compte de formation.',
  LEARNER_ALREADY_LINKED: 'Un autre compte DomiCares est déjà rattaché à votre compte de formation. Contactez le support.',
  ACCOUNT_NOT_LINKABLE: 'Cette adresse e-mail correspond à un compte formateur ou administrateur Akambi et ne peut pas être utilisée pour l’Academy.',
  ENROLLMENT_EXISTS_OUTSIDE_PARTNER: 'Vous êtes déjà inscrit à cette formation directement auprès d’Akambi Consulting.',
  CERTIFICATE_ISSUED: 'Cette formation est terminée et son attestation délivrée : la désinscription n’est plus possible.',
};

export function academyHttpError(err: unknown): unknown {
  if (!(err instanceof AkambiError)) return err;
  if (err.status === 409 && CONFLICTS[err.code]) return new ConflictException({ statusCode: 409, error: err.code, message: CONFLICTS[err.code] });
  if (err.code === 'COURSE_NOT_FOUND') return new NotFoundException({ statusCode: 404, error: err.code, message: 'Formation introuvable' });
  if (err.code === 'ENROLLMENT_NOT_FOUND') return new NotFoundException({ statusCode: 404, error: err.code, message: 'Inscription introuvable chez Akambi' });
  if (err.code === 'PARTNER_INACTIVE') return new ServiceUnavailableException({ statusCode: 503, error: err.code, message: 'DomiCares Academy est momentanément indisponible' });
  return new BadGatewayException({ statusCode: 502, error: 'AKAMBI_UNAVAILABLE', message: `Le service de formation ne répond pas correctement (${err.status} ${err.code}). Réessayez dans quelques instants.` });
}

/** Codes Akambi définitifs pour une demande : la nouvelle tentative ne changera rien sans action humaine. */
export function isDefinitive(err: AkambiError): boolean {
  return err.status >= 400 && err.status < 500;
}
