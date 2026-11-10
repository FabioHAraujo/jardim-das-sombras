import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { config } from './config.js';
import prismaPlugin from './plugins/prisma.js';
import { isTrustedRequest } from './plugins/auth.js';
import { DomainError } from './errors/DomainError.js';
import { CanvasRendererService } from './services/CanvasRendererService.js';
import { verifyAdminToken } from './utils/token.js';

import { farmRoutes } from './routes/farm.js';
import { shopRoutes } from './routes/shop.js';
import { inventoryRoutes } from './routes/inventory.js';
import { rankingsRoutes } from './routes/rankings.js';
import { adminRoutes } from './routes/admin.js';
import { superAdminRoutes } from './routes/superAdmin.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: config.CORS_ORIGINS === '*' ? '*' : config.CORS_ORIGINS.split(',').map((o) => o.trim()),
  });

  // Helmet with relaxed CSP for web farm viewer
  await fastify.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
      },
    },
  });

  // Rate Limiting (exempt trusted bot requests)
  await fastify.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => isTrustedRequest(req),
  });

  // Prisma plugin
  await fastify.register(prismaPlugin);

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    game: 'Jardim das Sombras (Shadow Garden)',
    timestamp: new Date().toISOString(),
  }));

  // Root route: se usuário tiver sessão salva (cookie ou localStorage), leva à fazenda admin
  fastify.get('/', async (req, reply) => {
    const cookieHeader = req.headers.cookie || '';
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach((pair) => {
      const [k, v] = pair.trim().split('=');
      if (k && v) cookies[k] = decodeURIComponent(v);
    });

    const adminToken = cookies['jds_admin_token'];
    if (adminToken) {
      const verification = verifyAdminToken(adminToken);
      if (verification.valid && verification.userId) {
        const player = await fastify.prisma.player.findUnique({
          where: { id: verification.userId },
          select: { uuid: true },
        });
        if (player) {
          return reply.redirect(302, `/farm?id=${player.uuid}`);
        }
      }
    }

    // Se não há cookie no cabeçalho, serve redirector rápido via localStorage
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Jardim das Sombras</title>
  <script>
    try {
      var sess = JSON.parse(localStorage.getItem('jds_admin_session') || '{}');
      if (sess && sess.farmUuid && sess.token) {
        window.location.replace('/farm?id=' + encodeURIComponent(sess.farmUuid) + '&token=' + encodeURIComponent(sess.token));
      } else {
        window.location.replace('/farm');
      }
    } catch(e) {
      window.location.replace('/farm');
    }
  </script>
</head>
<body style="background:#0c0814; color:#dfd7cc; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
  <p>Carregando seu Jardim das Sombras...</p>
</body>
</html>`);
  });

  // Register Routes
  await fastify.register(farmRoutes);
  await fastify.register(shopRoutes);
  await fastify.register(inventoryRoutes);
  await fastify.register(rankingsRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(superAdminRoutes);

  // Error handling
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: 'Erro interno no Jardim das Sombras',
      code: 'INTERNAL_ERROR',
    });
  });

  return fastify;
}

export async function start() {
  // Warm up Canvas renderer image cache
  console.log('Preloading assets and warming up Canvas cache...');
  await CanvasRendererService.init();

  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`\n🦇 [Jardim das Sombras] API running on http://0.0.0.0:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
