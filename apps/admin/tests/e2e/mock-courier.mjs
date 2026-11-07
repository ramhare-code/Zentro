// Local stand-in for the Shiprocket API, for automated tests ONLY.
// Implements just the calls Zentro makes, and checks auth like the real API.
import http from "node:http";

const TOKEN = "mock-shiprocket-token";
const orders = new Map(); // shipment_id -> order body
const tracks = new Map(); // awb -> activities
let seq = 500;
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, "http://x");
    const p = url.pathname.replace(/^\/v1\/external/, "");
    if (req.method === "POST" && p === "/auth/login") {
      return body.email === "ops@zentro.test" && body.password === "mock-pass" ? send(res, 200, { token: TOKEN }) : send(res, 401, { message: "Invalid email and password combination" });
    }
    if (p.startsWith("/__")) {
      if (p === "/__track") { tracks.set(body.awb, body.activities); return send(res, 200, { ok: true }); }
      if (p === "/__orders") return send(res, 200, [...orders.values()]);
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "Token has expired" });
    if (req.method === "POST" && p === "/orders/create/adhoc") {
      for (const k of ["order_id", "pickup_location", "billing_pincode", "billing_phone", "order_items", "weight", "length"]) if (!body[k]) return send(res, 422, { message: `The ${k} field is required.` });
      const id = ++seq;
      orders.set(id, body);
      return send(res, 200, { order_id: id + 9000, shipment_id: id, status: "NEW" });
    }
    if (req.method === "POST" && p === "/courier/assign/awb") {
      if (!orders.has(body.shipment_id)) return send(res, 404, { message: "Shipment not found" });
      return send(res, 200, { awb_assign_status: 1, response: { data: { awb_code: `AWB${body.shipment_id}77`, courier_name: "Delhivery Surface" } } });
    }
    if (req.method === "POST" && p === "/courier/generate/pickup") return send(res, 200, { pickup_status: 1 });
    if (req.method === "POST" && p === "/courier/generate/label") return send(res, 200, { label_created: 1, label_url: `https://labels.example.test/${body.shipment_id[0]}.pdf` });
    let m;
    if (req.method === "GET" && (m = p.match(/^\/courier\/track\/awb\/(\w+)$/))) {
      return send(res, 200, { tracking_data: { track_status: 1, shipment_track_activities: tracks.get(m[1]) ?? [] } });
    }
    send(res, 404, { message: "not found" });
  });
}).listen(Number(process.env.MOCK_COURIER_PORT ?? 3997));
