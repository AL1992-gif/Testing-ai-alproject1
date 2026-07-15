import { readFile } from "node:fs/promises";

const requiredChecks = [
  ["package.json", (text) => {
    const pkg = JSON.parse(text);
    return pkg.type === "module" &&
      pkg.scripts?.start === "node server.js" &&
      pkg.scripts?.validate?.includes("node --check server.js");
  }],
  ["server.js", (text) => (
    text.includes("process.env.PORT") &&
    text.includes("7860") &&
    text.includes("StreamableHTTPServerTransport") &&
    text.includes("public/aurora-widget.html") &&
    text.includes("ui://widget/aurora-widget.html")
  )],
  ["public/aurora-widget.html", (text) => (
    text.includes("<!doctype html>") &&
    text.includes("ui/initialize") &&
    text.includes("tools/call")
  )],
  ["Dockerfile", (text) => (
    text.includes("ENV PORT=7860") &&
    text.includes("EXPOSE 7860") &&
    text.includes("npm install --omit=dev")
  )],
  ["README.md", (text) => (
    text.startsWith("---") &&
    text.includes("sdk: docker") &&
    text.includes("app_port: 7860")
  )]
];

let failed = false;

for (const [file, check] of requiredChecks) {
  const text = await readFile(file, "utf8");
  if (!check(text)) {
    console.error(`Validation failed: ${file}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Aurora app validation passed.");
