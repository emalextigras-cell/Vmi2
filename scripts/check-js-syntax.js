import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const roots = ["js", "tests"];
const files = [];

async function collectJavaScriptFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectJavaScriptFiles(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

for (const root of roots) {
  await collectJavaScriptFiles(root);
}

if (files.length === 0) {
  console.error("Aucun fichier JavaScript trouvé dans js/ ou tests/.");
  process.exit(1);
}

let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || result.stdout || `Échec de vérification : ${file}`);
  }
}

if (failed) process.exit(1);
console.log(`Syntaxe JavaScript vérifiée : ${files.length} fichier(s) dans js/ et tests/.`);
