// Old bookmarks enter the same reader as the application's documentation controls.
// A fetch of these source documents for the reader never executes their scripts.
if (location.protocol === "https:" || location.protocol === "http:") {
  const url = new URL("/", location.origin);
  url.searchParams.set(
    "reference",
    location.pathname === "/verification.html" ? "verification" : "manual",
  );
  url.hash = location.hash;
  location.replace(url);
}
