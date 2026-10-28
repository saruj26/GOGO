import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { DomainErrorCode } from '../errors/domain.error';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  /** Correlates the sanitised client response with the full server-side log. */
  reference: string;
}

/**
 * The single exit point for every error.
 *
 * Clients receive a stable code, a sentence they can act on, and a reference.
 * They never receive a stack trace, a SQL fragment, a constraint name, a
 * provider response or a connection string — those go to the log, correlated by
 * the reference.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reference = randomUUID();

    const { status, body, logLevel } = this.translate(exception, reference);

    const context = `${request.method} ${request.url} → ${status} [${reference}]`;
    if (logLevel === 'error') {
      this.logger.error(context, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${context} ${body.code}`);
    }

    response.status(status).json({ error: body });
  }

  private translate(
    exception: unknown,
    reference: string,
  ): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        const p = payload as { code: string; message: string; details?: unknown };
        return {
          status,
          body: { code: p.code, message: p.message, details: p.details, reference },
          logLevel: status >= 500 ? 'error' : 'warn',
        };
      }

      // Validation pipe and framework exceptions.
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? (payload as { message: string | string[] }).message
          : exception.message;

      return {
        status,
        body: {
          code:
            status === HttpStatus.BAD_REQUEST
              ? DomainErrorCode.VALIDATION_FAILED
              : status === HttpStatus.NOT_FOUND
                ? DomainErrorCode.NOT_FOUND
                : status === HttpStatus.FORBIDDEN
                  ? DomainErrorCode.FORBIDDEN
                  : 'ERROR',
          message: Array.isArray(message) ? message.join('; ') : String(message),
          reference,
        },
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status = this.prismaStatus(exception);
      return {
        status,
        body: this.prismaBody(exception, reference),
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // The message contains the query shape — useful in the log, not to a client.
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: DomainErrorCode.VALIDATION_FAILED,
          message: 'The request could not be processed.',
          reference,
        },
        logLevel: 'error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
        reference,
      },
      logLevel: 'error',
    };
  }

  private prismaStatus(error: Prisma.PrismaClientKnownRequestError): number {
    switch (error.code) {
      case 'P2002':
        return HttpStatus.CONFLICT;
      case 'P2025':
        return HttpStatus.NOT_FOUND;
      case 'P2003':
        return HttpStatus.BAD_REQUEST;
      // P2028 transaction API error (usually a timeout), P2024 connection pool
      // exhausted, P2034 write conflict or deadlock. These are contention and
      // capacity problems, not client mistakes, and reporting them as
      // validation failures sends the client off debugging its own request.
      case 'P2024':
      case 'P2028':
      case 'P2034':
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.BAD_REQUEST;
    }
  }

  private prismaBody(
    error: Prisma.PrismaClientKnownRequestError,
    reference: string,
  ): ErrorBody {
    switch (error.code) {
      case 'P2002':
        return {
          code: DomainErrorCode.CONFLICT,
          message: 'That record already exists.',
          reference,
        };
      case 'P2025':
        return {
          code: DomainErrorCode.NOT_FOUND,
          message: 'The requested record was not found.',
          reference,
        };
      case 'P2024':
      case 'P2028':
      case 'P2034':
        return {
          code: 'SERVICE_BUSY',
          message: 'The service is busy right now. Please try again in a moment.',
          reference,
        };
      default:
        return {
          code: DomainErrorCode.VALIDATION_FAILED,
          message: 'The request could not be processed.',
          reference,
        };
    }
  }
}
