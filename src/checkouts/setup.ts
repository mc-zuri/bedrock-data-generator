// pnpm install's postinstall. A fresh clone has no data.js: its `prepare` script would build it, but linked
// dependencies are not built.
import { BEDROCK_PROTOCOL_DIR, NODE_MINECRAFT_DATA_DIR } from '../config.ts'
import { cloneCheckouts } from './clone.ts'
import { checkCheckouts, generateDataJs } from './mcdata.ts'

cloneCheckouts()
checkCheckouts()
generateDataJs()
console.log(`bedrock-protocol:    ${BEDROCK_PROTOCOL_DIR}`)
console.log(`node-minecraft-data: ${NODE_MINECRAFT_DATA_DIR} (data.js generated)`)
