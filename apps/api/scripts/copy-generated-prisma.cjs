const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '..', 'src', 'generated', 'prisma');
const destination = path.resolve(__dirname, '..', 'dist', 'generated', 'prisma');

if (!fs.existsSync(source)) {
  throw new Error(`Generated Prisma client not found at ${source}`);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true, force: true });
