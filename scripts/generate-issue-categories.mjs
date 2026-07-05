import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readIssueCategoryConfig, renderIssueCategoriesTs } from './issue-category-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const config = await readIssueCategoryConfig(projectRoot);
const rendered = renderIssueCategoriesTs(config);

const outputPaths = [
  path.join(projectRoot, 'src', 'generated', 'issue-categories.ts'),
  path.join(projectRoot, 'supabase', 'functions', '_shared', 'issue-categories.ts'),
];

await Promise.all(outputPaths.map(async (outputPath) => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, 'utf8');
}));

console.info(`Generated issue category config with ${config.categories.length} category/categories.`);
