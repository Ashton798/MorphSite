import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const config = {
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};
export default config;
