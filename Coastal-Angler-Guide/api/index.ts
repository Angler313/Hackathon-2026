import app from "../artifacts/api-server/src/app";

export default function handler(req: any, res: any) {
  const originalUrl = req.url;
  if (originalUrl && !originalUrl.startsWith("/api")) {
    req.url = `/api${originalUrl}`;
  }
  (app as any)(req, res);
}
