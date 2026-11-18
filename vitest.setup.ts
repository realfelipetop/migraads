import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Cada arquivo de teste usa uma pasta de dados própria e descartável (nunca a data/ real).
process.env.MIGRA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "migra-ads-test-"));
