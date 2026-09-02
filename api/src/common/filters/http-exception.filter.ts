import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/** Réponse d'erreur uniforme : { statusCode, error, message, details? } */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { statusCode: status, error: exception.name, message: body } : body;
      void reply.status(status).send(payload);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    void reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send({ statusCode: 500, error: 'Internal', message: 'Une erreur interne est survenue' });
  }
}
