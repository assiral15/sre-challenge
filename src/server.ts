import express, { Request, Response } from 'express';
import pino from 'pino';
require("./telemetry");

import { loadConfig } from './settings.js';
import { simulateLatency } from './utils.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export async function createApp() {
  const app = express();
  const config = loadConfig();

  app.use(express.json());

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'sre-hous3-challenge' });
  });

  app.get('/api/v1/orders', async (_req: Request, res: Response) => {
    const items = await simulateLatency('orders');
    res.json({ data: items, meta: { total: items.length } });
  });

  app.get('/api/v1/payments/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const payments = await simulateLatency('payments');
    const payment = payments.find((item) => item.id === id);

    if (!payment) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }

    res.json({ data: payment });
  });

  app.post('/api/v1/payments', async (req: Request, res: Response) => {
    const payload = req.body;

    if (!payload?.orderId || !payload?.amount) {
      res.status(400).json({ message: 'Invalid payload' });
      return;
    }

    const payments = await simulateLatency('payments');
    const existing = payments.find((payment) => payment.orderId === payload.orderId);

    if (existing) {
      res.status(409).json({ message: 'Payment already processed' });
      return;
    }

    // Ao instrumentar a aplicação, este evento deve gerar métricas e traces úteis
    const newPayment = { id: `pay_${Date.now()}`, ...payload };
    logger.info({ payment: newPayment }, 'payment processed');

    res.status(201).json({ data: newPayment });
  });

  app.use((err: Error, _req: Request, res: Response) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ message: 'Internal server error' });
  });
 
  return { app, config };
}

async function start() {
  const { app, config } = await createApp();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'server started');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    logger.error({ err }, 'server failed to start');
    process.exit(1);
  });
}

// TODO: Instrumentar com OpenTelemetry (traces, métricas, logs estruturados)

