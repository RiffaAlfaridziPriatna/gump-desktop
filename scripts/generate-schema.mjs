#!/usr/bin/env node
import openApiTs from 'openapi-typescript';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function generateSchema() {
  console.log(`Fetching OpenAPI schema from ${API_BASE_URL}/docs-json...`);

  try {
    const output = await openApiTs(`${API_BASE_URL}/docs-json`);
    const outputPath = path.resolve(
      __dirname,
      '../src/services/api/generated-schema.d.ts',
    );

    await fs.writeFile(outputPath, output);
    console.log(`Schema generated successfully at ${outputPath}`);
  } catch (error) {
    console.error('Failed to generate schema:', error.message);
    process.exit(1);
  }
}

generateSchema();
