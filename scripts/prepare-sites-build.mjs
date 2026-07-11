import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const distDirectory = new URL("../dist/", import.meta.url);
const clientDirectory = new URL("../dist/client/", import.meta.url);
const serverDirectory = new URL("../dist/server/", import.meta.url);
const workerSource = new URL("../worker/index.js", import.meta.url);
const workerTarget = new URL("../dist/server/index.js", import.meta.url);

await rm(clientDirectory, { recursive: true, force: true });
await rm(serverDirectory, { recursive: true, force: true });
await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distDirectory)) {
  if (entry === "client" || entry === "server") continue;
  await rename(join(distDirectory.pathname, entry), join(clientDirectory.pathname, entry));
}

await mkdir(serverDirectory, { recursive: true });
await copyFile(workerSource, workerTarget);
