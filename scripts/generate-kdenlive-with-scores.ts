import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Window } from "happy-dom";
import { importProject } from "../src/utils/exportImport";
import { analyzeKdenliveFile, exportToKdenlive } from "../src/utils/kdenliveExport";

function installDomGlobals(): void {
  const window = new Window();
  globalThis.DOMParser = window.DOMParser as typeof DOMParser;
  globalThis.XMLSerializer = window.XMLSerializer as typeof XMLSerializer;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/generate-kdenlive-with-scores.ts [--bin-only] <state.json> <input.kdenlive> [output.kdenlive]",
    "",
    "Example:",
    "  npx tsx scripts/generate-kdenlive-with-scores.ts tennis-match.json anthony-sun-1.kdenlive anthony-sun-1-with-scores.kdenlive",
    "  npx tsx scripts/generate-kdenlive-with-scores.ts --bin-only tennis-match.json anthony-sun-1.kdenlive anthony-sun-1-bin-only.kdenlive",
  ].join("\n");
}

function defaultOutputPath(inputKdenlivePath: string): string {
  const ext = path.extname(inputKdenlivePath);
  const base = ext.length > 0 ? inputKdenlivePath.slice(0, -ext.length) : inputKdenlivePath;
  return `${base}-with-scores.kdenlive`;
}

function normalizeKdenliveXml(rawXml: string): string {
  // happy-dom's XML parser is strict about declarations; strip it for robust parsing.
  return rawXml
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

function sanitizeGeneratedXml(xml: string): string {
  return xml.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const binOnly = rawArgs.includes("--bin-only");
  const positionalArgs = rawArgs.filter((arg) => arg !== "--bin-only");
  const [statePath, inputKdenlivePath, outputArg] = positionalArgs;

  if (!statePath || !inputKdenlivePath) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  installDomGlobals();

  const outputPath = outputArg ?? defaultOutputPath(inputKdenlivePath);
  const [stateJson, inputKdenliveXml] = await Promise.all([
    readFile(statePath, "utf8"),
    readFile(inputKdenlivePath, "utf8"),
  ]);

  const appState = importProject(stateJson);
  if (!appState.config) {
    throw new Error("Invalid project JSON: missing match config.");
  }

  const outputXml = exportToKdenlive(appState, normalizeKdenliveXml(inputKdenliveXml), {
    binOnly,
  });
  const sanitizedOutputXml = sanitizeGeneratedXml(outputXml);
  await writeFile(outputPath, sanitizedOutputXml, "utf8");

  const analysis = analyzeKdenliveFile(sanitizedOutputXml);
  const missingScoreProducers = analysis.orphanedProducers.filter((id) =>
    id.startsWith("kdenlive_scores_producer_")
  );

  console.log(`Wrote: ${outputPath}`);
  console.log(`Mode: ${binOnly ? "bin-only" : "timeline+bin"}`);
  console.log(`Project bin: ${analysis.hasProjectBin ? "found" : "missing"} (${analysis.binId ?? "n/a"})`);
  console.log(`Bin entries: ${analysis.binEntryCount}`);
  console.log(`Total producers: ${analysis.producerCount}`);
  console.log(`Score producers missing from bin: ${missingScoreProducers.length}`);

  if (missingScoreProducers.length > 0) {
    console.error("Missing score producers:");
    for (const id of missingScoreProducers) {
      console.error(`  - ${id}`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Generation failed: ${message}`);
  process.exitCode = 1;
});
