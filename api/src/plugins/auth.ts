import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { DomainError } from '../errors/DomainError.js';
import { verifyAdminToken } from '../utils/token.js';

export function isTrustedRequest(req: FastifyRequest): boolean {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  if (apiKeyHeader && apiKeyHeader === config.API_KEY) {
    return true;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === config.API_KEY) {
      return true;
    }
  }

  return false;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (isTrustedRequest(req)) {
    return;
  }

  // Check for temporary user admin token
  let userToken: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    userToken = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    userToken = String(req.headers['x-admin-token']).trim();
  } else if ((req.query as any)?.token) {
    userToken = String((req.query as any).token).trim();
  }

  if (userToken) {
    const verification = verifyAdminToken(userToken);
    if (verification.valid && verification.userId) {
      const paramsUserId = (req.params as any)?.user_id;
      const bodyUserId = (req.body as any)?.userId;

      if (paramsUserId && paramsUserId !== verification.userId) {
        throw new DomainError('Acesso não autorizado para esta fazenda.', 'FORBIDDEN', 403);
      }
      if (bodyUserId && bodyUserId !== verification.userId) {
        throw new DomainError('Acesso não autorizado para esta fazenda.', 'FORBIDDEN', 403);
      }

      (req as any).adminUserId = verification.userId;
      return;
    } else {
      throw new DomainError('Sessão administrativa expirada ou inválida. Obtenha um novo link no bot.', 'TOKEN_EXPIRED', 401);
    }
  }

  throw new DomainError('Chave de API ou Token inválido ou não fornecido', 'UNAUTHORIZED', 401);
}

export async function requireBotApiKey(req: FastifyRequest, reply: FastifyReply) {
  if (isTrustedRequest(req)) {
    return;
  }
  throw new DomainError('Acesso restrito exclusivamente para chamadas internas do bot (requer API_KEY).', 'UNAUTHORIZED', 401);
}

