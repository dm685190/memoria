import { NextRequest, NextResponse } from "next/server";

// www.sprlrsrchlab.com and sprlrsrchlab.com both serve the same content:
//   /            → landing page
//   /search/     → Memory Search (was ms.sprlrsrchlab.com)
//   /lab.html, /graphify-map.html, /knowledge-graph-viewer.html → static site pages

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
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

  // Everything else → normal Next.js behavior (includes /search, API routes, etc.)
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Next.js internals and the site files themselves
    "/((?!_next/static|_next/image|favicon.ico|site/).*)",
  ],
};
