import { spawnSync } from "node:child_process";
import { join } from "node:path";

const heapOption = "--max-old-space-size=4096";
const currentNodeOptions = process.env.NODE_OPTIONS || "";
const nodeOptions = currentNodeOptions.includes("--max-old-space-size")
  ? currentNodeOptions
  : `${currentNodeOptions} ${heapOption}`.trim();

const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
});

process.exit(result.status ?? 1);
