import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db.ts';
import { publicRouter } from './server/routes/publicRoutes.ts';
import { customerRouter } from './server/routes/customerRoutes.ts';
import { paymentRouter } from './server/routes/paymentRoutes.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function bootstrap() {
  // Initialize and seed database on boot
  getDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Mount REST APIs
  app.use('/api', publicRouter);
  app.use('/api/customer', customerRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/admin', adminRouter);

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SHOPKART full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
