import http from 'k6/http';
import { sleep } from 'k6';

export default function () {
  http.get('http://app:3000/ping');
  sleep(1);
}
