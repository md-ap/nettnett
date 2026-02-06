import https from "https";

const IA_ACCESS_KEY = process.env.IA_S3_ACCESS_KEY!;
const IA_SECRET_KEY = process.env.IA_S3_SECRET_KEY!;

export interface IAMetadata {
  title: string;
  description: string;
  mediatype: string;
  creator?: string;
  date?: string;
  subject?: string[];
  language?: string;
  collection?: string;
}

function sanitizeIdentifier(title: string, userFolder: string): string {
  return (
    userFolder +
    "-" +
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 80)
  );
}

function iaRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: Buffer
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: "s3.us.archive.org",
      path,
      method,
      headers: {
        Authorization: `LOW ${IA_ACCESS_KEY}:${IA_SECRET_KEY}`,
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      // Follow 307 redirects
      if (res.statusCode === 307 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location);
        const redirectOptions: https.RequestOptions = {
          hostname: redirectUrl.hostname,
          path: redirectUrl.pathname + redirectUrl.search,
          method,
          headers: options.headers,
        };
        const req2 = https.request(redirectOptions, (res2) => {
          let data = "";
          res2.on("data", (chunk) => (data += chunk));
          res2.on("end", () => resolve({ statusCode: res2.statusCode || 500, body: data }));
        });
        req2.on("error", reject);
        if (body) req2.write(body);
        req2.end();
        return;
      }

      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode || 500, body: data }));
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function uploadToInternetArchive(
  identifier: string,
  filename: string,
  fileBody: Buffer,
  metadata: IAMetadata,
  isFirstFile: boolean
): Promise<{ success: boolean; itemUrl: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(fileBody.length),
  };

  if (isFirstFile) {
    headers["x-archive-auto-make-bucket"] = "1";
    headers["x-archive-meta-mediatype"] = metadata.mediatype;
    headers["x-archive-meta-collection"] = metadata.collection || "opensource";
    headers["x-archive-meta-title"] = `uri(${encodeURIComponent(metadata.title)})`;
    headers["x-archive-meta-description"] = `uri(${encodeURIComponent(metadata.description)})`;

    if (metadata.creator) {
      headers["x-archive-meta-creator"] = `uri(${encodeURIComponent(metadata.creator)})`;
    }
    if (metadata.date) {
      headers["x-archive-meta-date"] = metadata.date;
    }
    if (metadata.language) {
      headers["x-archive-meta-language"] = metadata.language;
    }
    if (metadata.subject) {
      metadata.subject.forEach((subj, i) => {
        const idx = String(i + 1).padStart(2, "0");
        headers[`x-archive-meta${idx}-subject`] = `uri(${encodeURIComponent(subj)})`;
      });
    }
  }

  const path = `/${identifier}/${encodeURIComponent(filename)}`;
  const result = await iaRequest("PUT", path, headers, fileBody);

  if (result.statusCode !== 200) {
    throw new Error(`IA upload failed (${result.statusCode}): ${result.body}`);
  }

  return {
    success: true,
    itemUrl: `https://archive.org/details/${identifier}`,
  };
}

export async function deleteFromInternetArchive(
  identifier: string,
  filename: string
): Promise<boolean> {
  const path = `/${identifier}/${encodeURIComponent(filename)}`;
  const result = await iaRequest("DELETE", path, {
    "x-archive-cascade-delete": "1",
  });
  return result.statusCode === 200 || result.statusCode === 204;
}

export { sanitizeIdentifier };
