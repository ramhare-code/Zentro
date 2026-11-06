// Local stand-in for the Razorpay REST API, for automated tests ONLY.
// Implements just what Zentro calls, with real HMAC signatures, so the
// server-side verification code is exercised exactly as in production.
import { createHmac } from "node:crypto";
import http from "node:http";

const SECRET = process.env.MOCK_RZP_SECRET ?? "mock_secret";
const orders = new Map();
const payments = new Map();
let seq = 0;

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://x");
    const auth = req.headers.authorization ?? "";
    const isApi = url.pathname.startsWith("/v1/");
    if (isApi && auth !== "Basic " + Buffer.from(`rzp_test_mock:${SECRET}`).toString("base64")) return send(res, 401, { error: { description: "bad auth" } });

    if (req.method === "POST" && url.pathname === "/v1/orders") {
      const o = { id: `order_mock${++seq}`, amount: body.amount, currency: body.currency, receipt: body.receipt, status: "created" };
      orders.set(o.id, o);
      return send(res, 200, o);
    }
    let m;
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/orders\/([\w]+)\/payments$/))) {
      return send(res, 200, { entity: "collection", items: [...payments.values()].filter((p) => p.order_id === m[1]) });
    }
    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/payments\/([\w]+)$/))) {
      const p = payments.get(m[1]);
      return p ? send(res, 200, p) : send(res, 404, { error: { description: "not found" } });
    }
    if (req.method === "POST" && (m = url.pathname.match(/^\/v1\/payments\/([\w]+)\/capture$/))) {
      const p = payments.get(m[1]); p.status = "captured"; return send(res, 200, p);
    }
    if (req.method === "POST" && (m = url.pathname.match(/^\/v1\/payments\/([\w]+)\/refund$/))) {
      return send(res, 200, { id: `rfnd_mock${++seq}`, payment_id: m[1], amount: body.amount, status: "processed" });
    }
    // test control: the "customer pays" in the stubbed checkout window
    if (req.method === "POST" && url.pathname === "/__pay") {
      const o = orders.get(body.order_id);
      if (!o) return send(res, 404, {});
      const p = { id: `pay_mock${++seq}`, order_id: o.id, amount: body.amount ?? o.amount, currency: "INR", status: body.status ?? "captured", method: body.method ?? "upi",
        fee: Math.round((body.amount ?? o.amount) * 0.0236), tax: Math.round((body.amount ?? o.amount) * 0.0036),
        error_code: body.status === "failed" ? "BAD_REQUEST_ERROR" : null, error_description: body.status === "failed" ? "Payment declined by bank" : null };
      payments.set(p.id, p);
      const signature = body.forge ? "0".repeat(64) : createHmac("sha256", SECRET).update(`${o.id}|${p.id}`).digest("hex");
      return send(res, 200, { razorpay_order_id: o.id, razorpay_payment_id: p.id, razorpay_signature: signature });
    }
    send(res, 404, {});
  });
}).listen(Number(process.env.MOCK_RZP_PORT ?? 3999));
