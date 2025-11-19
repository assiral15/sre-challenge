import axios from 'axios';
import { context, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('payments-test-tracer');

async function sendPayment(orderId, amount) {
  const span = tracer.startSpan('simulate-payment');
  await context.with(trace.setSpan(context.active(), span), async () => {
    try {
      await axios.post('http://localhost:3001/api/v1/payments', {
        orderId,
        amount,
      });
      console.log(`Payment sent: ${orderId}, amount: ${amount}`);
    } catch (err) {
      console.error('Error sending payment:', err.message);
    } finally {
      span.end();
    }
  });
}

// Gera requisições a cada 5 segundos
let counter = 1;
setInterval(() => {
  const orderId = `ord_auto_${counter}`;
  const amount = Math.floor(Math.random() * 500 + 50);
  sendPayment(orderId, amount);
  counter++;
}, 5000);
