import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

const clerk = clerkMiddleware();
const PROXY_PATH = "/__clerk";

function frontendApiFromPublishableKey(publishableKey: string): string | null {
  const encoded = publishableKey.split("_").pop();
  if (!encoded) return null;

  try {
    return Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  } catch {
    return null;
  }
}

async function proxyClerkFrontendApi(request: NextRequest): Promise<Response> {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  const frontendApi = publishableKey ? frontendApiFromPublishableKey(publishableKey) : null;

  if (!frontendApi || !secretKey) {
    return Response.json(
      { errors: [{ code: "proxy_configuration_error", message: "Missing Clerk proxy configuration" }] },
      { status: 500 },
    );
  }

  const requestUrl = new URL(request.url);
  const targetPath = requestUrl.pathname.slice(PROXY_PATH.length) || "/";
  const targetUrl = new URL(`https://${frontendApi}${targetPath}`);
  targetUrl.search = requestUrl.search;

  const headers = new Headers();
  headers.set("Clerk-Proxy-Url", `${requestUrl.origin}${PROXY_PATH}`);
  headers.set("Clerk-Secret-Key", secretKey);
  headers.set("Accept", request.headers.get("accept") || "application/json");
  headers.set("Accept-Encoding", "identity");
  headers.set("User-Agent", request.headers.get("user-agent") || "Robin-Cloud-Clerk-Proxy");

  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("Cookie", cookie);

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    // @ts-expect-error required by undici for streamed request bodies
    duplex: request.body ? "half" : undefined,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  const location = responseHeaders.get("location");
  if (location) {
    const locationUrl = new URL(location, `https://${frontendApi}`);
    if (locationUrl.host === frontendApi) {
      responseHeaders.set("location", `${requestUrl.origin}${PROXY_PATH}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export default function proxy(request: NextRequest, event: Parameters<typeof clerk>[1]) {
  if (request.nextUrl.pathname === PROXY_PATH || request.nextUrl.pathname.startsWith(`${PROXY_PATH}/`)) {
    return proxyClerkFrontendApi(request);
  }

  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
