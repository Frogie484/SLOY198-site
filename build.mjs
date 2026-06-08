import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL(".", import.meta.url);
const output = new URL("dist/", root);
const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
const sourceExtensions = new Set([".html", ".css", ".js"]);
const sourceFiles = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && sourceExtensions.has(extname(entry.name)))
  .map((entry) => entry.name)
  .filter((name) => name !== "build.mjs");
const htmlFiles = sourceFiles.filter((name) => extname(name) === ".html");
const errors = [];

for (const file of sourceFiles) {
  const content = await readFile(new URL(file, root), "utf8");

  if (extname(file) !== ".html") {
    continue;
  }

  if (!content.includes(viewportTag)) {
    errors.push(`${file}: отсутствует обязательный viewport`);
  }

  const localLinks = [...content.matchAll(/href="([^"#?]+\.html)(?:#[^"]*)?"/g)]
    .map((match) => match[1]);

  for (const link of localLinks) {
    if (!htmlFiles.includes(link)) {
      errors.push(`${file}: ссылка ведёт на отсутствующий файл ${link}`);
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Сборка остановлена:\n${errors.join("\n")}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of sourceFiles) {
  await cp(new URL(file, root), new URL(file, output));
}

await cp(new URL("assets/", root), new URL("assets/", output), { recursive: true });

console.log(`SLOY198: собрано ${htmlFiles.length} HTML-страниц в ${fileURLToPath(output)}`);
