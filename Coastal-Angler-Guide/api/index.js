import handlerApp from "../artifacts/api-server/dist/index.mjs";

export default function handler(req, res) {
  const originalUrl = req.url;
  if (originalUrl && !originalUrl.startsWith("/api")) {
    req.url = "/api" + originalUrl;
  }
  handlerApp(req, res);
}
