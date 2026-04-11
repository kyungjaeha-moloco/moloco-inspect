import Ajv from 'ajv/dist/2020.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf-8'));
}

const ajv = new Ajv({ strict: false, allErrors: true });

const files = [
  {
    label: 'tokens.json',
    schema: loadJSON('schemas/tokens.schema.json'),
    data: loadJSON('src/tokens.json'),
  },
  {
    label: 'components.json',
    schema: loadJSON('schemas/components.schema.json'),
    data: loadJSON('src/components.json'),
  },
  {
    label: 'patterns.json',
    schema: loadJSON('schemas/patterns.schema.json'),
    data: loadJSON('src/patterns.json'),
  },
  {
    label: 'conventions.json',
    schema: loadJSON('schemas/conventions.schema.json'),
    data: loadJSON('src/conventions.json'),
  },
];

let allPassed = true;

for (const { label, schema, data } of files) {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    console.log(`PASS  ${label}`);
  } else {
    allPassed = false;
    console.log(`FAIL  ${label}`);
    for (const err of validate.errors) {
      console.log(`      ${err.instancePath || '(root)'} ${err.message}`);
    }
  }
}

if (!allPassed) {
  process.exit(1);
}
