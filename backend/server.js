import http from "http";
import url from "url";
import { analyzeJobTextNode, analyzeScreenshotNode } from "./analyzer_helper.js";

const PORT = 4000;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  let body = "";
  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      let jsonBody = {};
      if (body) {
        try {
          jsonBody = JSON.parse(body);
        } catch {
          // ignore
        }
      }

      if (pathname === "/api/analyze" && req.method === "POST") {
        const { title, company, website, description, email, salary } = jsonBody;
        const result = analyzeJobTextNode(
          title || "",
          company || "",
          website || "",
          description || "",
          email || "",
          salary || ""
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ analysis: { id: "ana_" + Date.now(), ...result } }));
        return;
      }

      if (pathname === "/api/analyze-screenshot" && req.method === "POST") {
        const result = analyzeScreenshotNode(null, "uploaded_screenshot.png");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ analysis: { id: "ana_scr_" + Date.now(), ...result } }));
        return;
      }

      if (pathname === "/api/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "InternShield Node API" }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`InternShield Node API server running on http://127.0.0.1:${PORT}`);
});
