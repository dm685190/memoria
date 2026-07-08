import { NextRequest, NextResponse } from "next/server";

const WWW_HOST = "www.sprlrsrchlab.com";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const url = request.nextUrl.clone();

  // www.sprlrsrchlab.com → serve static site files
  if (host === WWW_HOST) {
    const path = url.pathname;

    // Root → landing page
    if (path === "/") {
      url.pathname = "/site/index.html";
      return NextResponse.rewrite(url);
    }

    // Known static site pages
    if (/^\/(lab|graphify-map|knowledge-graph-viewer)\.html$/.test(path)) {
      url.pathname = "/site" + path;
      return NextResponse.rewrite(url);
    }

    // Graph data files
    if (path.startsWith("/graph-data/")) {
      url.pathname = "/site" + path;
      return NextResponse.rewrite(url);
    }

    // Everything else → landing page (catch-all)
    url.pathname = "/site/index.html";
    return NextResponse.rewrite(url);
  }

  // ms.sprlrsrchlab.com or any other host → normal Next.js behavior
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths for www
    "/((?!_next/static|_next/image|favicon.ico|site/).*)",
  ],
};
