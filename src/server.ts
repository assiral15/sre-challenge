import "./telemetry.cjs";

import express, { Request, Response } from 'express';
import pino from 'pino';
import { loadConfig } from './settings.js';
import { simulateLatency } from './utils.js';
import { trace } from '@opentelemetry/api';
import client from 'prom-client';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Pagamentos em memória
let payments: any[] = [];

// Prometheus metrics
const register = client.register;
const paymentsCreated = new client.Counter({
  name: 'payments_created_total',
  help: 'Total payments created',
});

export async function createApp() {
  const app = express();
  const config = loadConfig();

  app.use(express.json());

  // Health check
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'sre-hous3-challenge' });
  });

  // Orders com latência simulada
  app.get('/api/v1/orders', async (_req: Request, res: Response) => {
    const items = await simulateLatency('orders');
    res.json({ data: items, meta: { total: items.length } });
  });

  // Buscar pagamento pelo id
  app.get('/api/v1/payments/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const payment = payments.find((p) => p.id === id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({ data: payment });
  });

  // Criar pagamento
  app.post('/api/v1/payments', async (req: Request, res: Response) => {
    const payload = req.body;

    if (!payload?.orderId || !payload?.amount) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const existing = payments.find((p) => p.orderId === payload.orderId);
    if (existing) {
      return res.status(409).json({ message: 'Payment already processed' });
    }

    // Tracing OpenTelemetry
    const tracer = trace.getTracer('payments-service');
    const span = tracer.startSpan('create_payment');
    span.setAttribute('orderId', payload.orderId);
    span.setAttribute('amount', payload.amount);

    // Criar pagamento
    const newPayment = { id: `pay_${Date.now()}`, ...payload };
    payments.push(newPayment);

    // Logs Pino + Prometheus
    logger.info({ payment: newPayment }, 'payment processed');
    paymentsCreated.inc();

    span.end();

    res.status(201).json({ data: newPayment });
  });

  // Endpoint métricas Prometheus
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Middleware de erro
  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ message: 'Internal server error' });
  });

  return { app, config };
}

// Inicializa o servidor
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