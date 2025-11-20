import "./telemetry.js"; // importa OpenTelemetry

import express, {
  Request,
  Response,
  NextFunction
} from 'express';

import pino from 'pino';
import { loadConfig } from './settings.js';
import { simulateLatency } from './utils.js';
import { trace } from '@opentelemetry/api';
import client from 'prom-client';

// ========== LOGGER ==========
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  client.collectDefaultMetrics({
    labels: { service: 'payments-api' },
});


// ========== MÉTRICAS ==========
const register = client.register;

const paymentsCreated = new client.Counter({
  name: 'payments_created_total',
  help: 'Total payments created',
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP errors',
  labelNames: ['route', 'method', 'status_code'],
});

// Fake database
let payments: any[] = [];


// ======================================================
//                     APLICACÃO
// ======================================================
export async function createApp() {
  const app = express();
  const config = loadConfig();

  app.use(express.json());

  // ===== Middleware de Métricas =====
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const diffSeconds = Number(end - start) / 1e9;

      const route =
        (req.route?.path as string) ??
        req.path ??
        "unknown_route";

      httpRequestDuration
        .labels(route, req.method, String(res.statusCode))
        .observe(diffSeconds);

      if (res.statusCode >= 400) {
        httpErrorsTotal
          .labels(route, req.method, String(res.statusCode))
          .inc();
      }
    });

    next();
  });

  // ===== HEALTH =====
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'sre-hous3-challenge'
    });
  });

  // ===== ORDERS =====
  app.get('/api/v1/orders', async (_req: Request, res: Response) => {
    const items = await simulateLatency('orders');
    res.json({ data: items, meta: { total: items.length } });
  });

  // ===== GET PAYMENTS =====
  app.get('/api/v1/payments/:id', (req: Request, res: Response) => {
    const payment = payments.find((p) => p.id === req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ data: payment });
  });

  // ===== CREATE PAYMENT =====
  app.post('/api/v1/payments', async (req: Request, res: Response) => {
    const payload = req.body;

    if (!payload?.orderId || !payload?.amount) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const existing = payments.find((p) => p.orderId === payload.orderId);
    if (existing) {
      return res.status(409).json({ message: 'Payment already processed' });
    }

    // ===== Tracing =====
    const tracer = trace.getTracer('payments-service');
    const span = tracer.startSpan('create_payment');

    span.setAttribute('orderId', payload.orderId);
    span.setAttribute('amount', payload.amount);

    const newPayment = {
      id: `pay_${Date.now()}`,
      ...payload
    };

    payments.push(newPayment);

    logger.info({ payment: newPayment }, 'payment processed');
    paymentsCreated.inc();

    span.end();

    res.status(201).json({ data: newPayment });
  });

  // ===== METRICS =====
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ===== ERROR HANDLER =====
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ message: 'Internal server error' });
  });

  return { app, config };
}


// ======================================================
//                  START SERVER
// ======================================================
async function start() {
  const { app, config } = await createApp();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'server started');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(err => {
    logger.error({ err }, 'server failed to start');
    process.exit(1);
  });
}
