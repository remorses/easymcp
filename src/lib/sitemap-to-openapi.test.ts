import { describe, it, expect } from "vitest";
import { generateOpenAPIFromSitemap } from "./sitemap-to-openapi.js";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const testCases = [
  {
    id: "bey_dev",
    url: "https://docs.bey.dev/sitemap.xml",
    name: "Bey Dev Docs",
    serverUrl: "https://api.bey.dev",
  },
  {
    id: "aci_dev",
    url: "https://www.aci.dev/docs/sitemap.xml",
    name: "ACI Dev Docs",
    serverUrl: "https://www.aci.dev",
  },
];

describe(
  "sitemap-to-openapi",
  () => {
    it.each(testCases)(
      "should generate OpenAPI schema for $id",
      async ({ id, url, name, serverUrl }) => {
        const schema = await generateOpenAPIFromSitemap(url, {name, serverUrl});

        expect(schema).toBeDefined();
        expect(schema.paths).toBeDefined();
        expect(typeof schema.paths).toBe("object");

        const outputPath = `openapis/results/${id}.json`;
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, JSON.stringify(schema, null, 2));

        // expect(schema).toMatchSnapshot();
      },
    );
  },
  1000 * 10,
);
