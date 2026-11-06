// Local stand-in for Resend, MSG91 and WhatsApp Cloud API — tests ONLY.
import http from "node:http";
const sent = [];
let n = 0;
http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const json = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === "/__sent") return json(200, sent);
    if (req.url === "/__reset") { sent.length = 0; return json(200, {}); }
    if (req.url === "/emails" && req.headers.authorization === "Bearer re_mock") { const id = `em_${++n}`; sent.push({ provider: "resend", id, to: body.to[0], text: body.text, subject: body.subject, headers: body.headers }); return json(200, { id }); }
    if (req.url === "/api/v5/flow" && req.headers.authkey === "msg91_mock") { const id = `rq_${++n}`; sent.push({ provider: "msg91", id, to: body.recipients[0].mobiles, template: body.template_id, vars: body.recipients[0] }); return json(200, { type: "success", message: id }); }
    if (req.url?.startsWith("/v21.0/") && req.headers.authorization === "Bearer wa_mock") { const id = `wamid.${++n}`; sent.push({ provider: "whatsapp", id, to: body.to, template: body.template }); return json(200, { messages: [{ id }] }); }
    json(401, { error: "bad credentials" });
  });
}).listen(3998);
