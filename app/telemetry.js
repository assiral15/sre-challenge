const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const traceExporter = new OTLPTraceExporter({
  url: 'http://otel-collector:4318/v1/traces', 
});

const metricsExporter = new OTLPMetricExporter({
  url: 'http://otel-collector:4318/v1/metrics',
});

const sdk = new NodeSDK({
  traceExporter,
  metricExporter: metricsExporter,
  serviceName: 'payments-service', // nome que vai aparecer no Jaeger/Grafana
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

sdk.start()
  .then(() => console.log('OTEL SDK started'))
  .catch((err) => console.error('Error starting OTEL SDK', err));
