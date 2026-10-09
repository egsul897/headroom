/**
 * Inspect Cursor Cloud VM resources for Headroom compute fitness.
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { VmResourceSnapshot } from "./types";

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function parseMeminfo(): { totalBytes: number; freeBytes: number; availableBytes: number; swapTotalBytes: number } {
  const text = readText("/proc/meminfo") ?? "";
  const get = (key: string): number => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number(m[1]) * 1024 : 0;
  };
  return {
    totalBytes: get("MemTotal"),
    freeBytes: get("MemFree"),
    availableBytes: get("MemAvailable"),
    swapTotalBytes: get("SwapTotal"),
  };
}

function parseCpu(): { model: string | null; mhz: number | null; flagsSample: string[] } {
  const text = readText("/proc/cpuinfo") ?? "";
  const model = text.match(/^model name\s*:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const mhzRaw = text.match(/^cpu MHz\s*:\s*([\d.]+)$/m)?.[1];
  const flags = text.match(/^flags\s*:\s*(.+)$/m)?.[1]?.trim().split(/\s+/) ?? [];
  return { model, mhz: mhzRaw ? Number(mhzRaw) : null, flagsSample: flags.slice(0, 24) };
}

function parseDfRoot(): { totalBytes: number; usedBytes: number; availableBytes: number } {
  try {
    const out = execFileSync("df", ["-B1", "--output=size,used,avail", "/"], { encoding: "utf-8" });
    const line = out.trim().split("\n").pop() ?? "";
    const parts = line.trim().split(/\s+/).map(Number);
    return { totalBytes: parts[0] ?? 0, usedBytes: parts[1] ?? 0, availableBytes: parts[2] ?? 0 };
  } catch {
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
  }
}

function dirSizeBytes(dir: string): number {
  try {
    const out = execFileSync("du", ["-sb", dir], { encoding: "utf-8" });
    return Number(out.split(/\s+/)[0] ?? 0);
  } catch {
    return 0;
  }
}

function softUlimit(flag: string): number | null {
  try {
    const out = execFileSync("bash", ["-lc", `ulimit ${flag}`], { encoding: "utf-8" }).trim();
    if (out === "unlimited") return null;
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function pythonVersion(): string | null {
  try {
    return execFileSync("python3", ["--version"], { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function writable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

async function probeUrl(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
    return { ok: res.status > 0 && res.status < 500, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

function listGpuDevices(): string[] {
  const found: string[] = [];
  try {
    for (const name of fs.readdirSync("/dev")) {
      if (name.startsWith("nvidia") || name.startsWith("dri")) found.push(`/dev/${name}`);
    }
  } catch {
    /* ignore */
  }
  return found;
}

function nvidiaSmiAvailable(): boolean {
  try {
    execFileSync("nvidia-smi", ["-L"], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export async function inspectEnvironment(options?: { skipNetwork?: boolean }): Promise<VmResourceSnapshot> {
  const mem = parseMeminfo();
  const cpu = parseCpu();
  const disk = parseDfRoot();
  const gpuDevices = listGpuDevices();
  const nvidia = nvidiaSmiAvailable();

  let secGovReachable = false;
  let dataSecGovStatus: number | null = null;
  let npmRegistryReachable = false;
  if (!options?.skipNetwork) {
    const sec = await probeUrl("https://www.sec.gov/", {
      "User-Agent": "Headroom/1.0 (contact: engineering@headroom-app.example)",
    });
    secGovReachable = sec.ok;
    const dataSec = await probeUrl("https://data.sec.gov/", {
      "User-Agent": "Headroom/1.0 (contact: engineering@headroom-app.example)",
    });
    // SEC data API often returns 403 on HEAD without Accept; any HTTP response proves reachability.
    dataSecGovStatus = dataSec.status;
    const npm = await probeUrl("https://registry.npmjs.org/");
    npmRegistryReachable = npm.ok;
  }

  const artifactsDir = "/opt/cursor/artifacts";
  const agentStore = "/cursor/stores";
  const runtimeNotes: string[] = [
    "Cursor Cloud agent VM snapshot; disk is ephemeral per run unless results are written to git, blob, or an external DB.",
    "No GPU devices observed unless listed under gpu.devices.",
    "Egress appears unrestricted for this personal environment (cursor-cloud environment-info).",
    "Do not initiate paid GPU or model calls without explicit authorization.",
  ];

  return {
    capturedAt: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    nodeVersion: process.version,
    pythonVersion: pythonVersion(),
    cpu: {
      logicalCpus: os.cpus().length,
      model: cpu.model,
      mhz: cpu.mhz,
      flagsSample: cpu.flagsSample,
    },
    memory: {
      totalBytes: mem.totalBytes,
      freeBytes: mem.freeBytes,
      availableBytes: mem.availableBytes,
      usedBytes: Math.max(0, mem.totalBytes - mem.availableBytes),
      swapTotalBytes: mem.swapTotalBytes,
    },
    disk: {
      rootTotalBytes: disk.totalBytes,
      rootUsedBytes: disk.usedBytes,
      rootAvailableBytes: disk.availableBytes,
      workspaceUsedBytes: dirSizeBytes(process.cwd()),
    },
    gpu: {
      present: gpuDevices.some((d) => d.includes("nvidia")) || nvidia,
      devices: gpuDevices,
      nvidiaSmiAvailable: nvidia,
    },
    network: {
      egressRestricted: false,
      secGovReachable,
      dataSecGovStatus,
      npmRegistryReachable,
    },
    persistence: {
      workspaceWritable: writable(path.join(process.cwd(), ".local-blob-storage")),
      artifactsDirWritable: writable(path.join(artifactsDir, "cursor-cloud-compute")),
      agentStoreMounted: fs.existsSync(agentStore),
      localBlobFallbackAvailable: true,
      postgresConfigured: Boolean(process.env.DATABASE_URL),
      vercelBlobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
    limits: {
      openFiles: softUlimit("-n"),
      maxUserProcesses: softUlimit("-u"),
      cpuTimeSeconds: softUlimit("-t"),
      virtualMemoryBytes: softUlimit("-v"),
      noHardCpuTimeLimitObserved: softUlimit("-t") === null,
    },
    runtimeNotes,
  };
}
