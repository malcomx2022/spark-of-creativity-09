import { BadGatewayException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { splitName } from './academy-enrollments.service';
import { academyHttpError } from './academy.errors';
import { AkambiError } from './akambi.client';

describe('splitName', () => {
  it('premier mot = prénom, le reste = nom', () => {
    expect(splitName('Awa Diallo')).toEqual({ firstName: 'Awa', lastName: 'Diallo' });
    expect(splitName('  Jean   Paul de la Croix ')).toEqual({ firstName: 'Jean', lastName: 'Paul de la Croix' });
  });

  it('un seul mot, vide ou absent : nom à demander', () => {
    for (const value of ['Awa', '', '   ', null, undefined]) expect(splitName(value)).toBeNull();
  });
});

describe('academyHttpError', () => {
  const akambi = (status: number, code: string) => new AkambiError('Message Akambi pour awa@example.com', status, code);

  it('conflits documentés : 409 avec code stable et message DomiCares', () => {
    for (const code of ['LEARNER_EMAIL_MISMATCH', 'LEARNER_ALREADY_LINKED', 'ACCOUNT_NOT_LINKABLE', 'ENROLLMENT_EXISTS_OUTSIDE_PARTNER', 'CERTIFICATE_ISSUED']) {
      const err = academyHttpError(akambi(409, code)) as ConflictException;
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({ statusCode: 409, error: code });
    }
  });

  it('404, 503 et 502 selon le code ; jamais le message d’Akambi', () => {
    expect(academyHttpError(akambi(404, 'COURSE_NOT_FOUND'))).toBeInstanceOf(NotFoundException);
    expect(academyHttpError(akambi(404, 'ENROLLMENT_NOT_FOUND'))).toBeInstanceOf(NotFoundException);
    expect(academyHttpError(akambi(403, 'PARTNER_INACTIVE'))).toBeInstanceOf(ServiceUnavailableException);
    for (const [status, code] of [[500, 'INTERNAL_ERROR'], [504, 'TIMEOUT'], [401, 'INVALID_SIGNATURE'], [404, 'LEARNER_NOT_FOUND'], [409, 'INCONNU']] as const) {
      const err = academyHttpError(akambi(status, code)) as BadGatewayException;
      expect(err).toBeInstanceOf(BadGatewayException);
      expect(JSON.stringify(err.getResponse())).toContain(`${status} ${code}`);
    }
    for (const code of ['LEARNER_EMAIL_MISMATCH', 'COURSE_NOT_FOUND', 'INTERNAL_ERROR']) {
      expect(JSON.stringify((academyHttpError(akambi(code === 'INTERNAL_ERROR' ? 500 : code === 'COURSE_NOT_FOUND' ? 404 : 409, code)) as ConflictException).getResponse())).not.toContain('awa@example.com');
    }
  });

  it('erreur non Akambi : rendue telle quelle', () => {
    const other = new Error('autre');
    expect(academyHttpError(other)).toBe(other);
  });
});
