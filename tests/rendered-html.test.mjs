import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("defines search and social metadata for fresh milk delivery", async () => {
  const layout = await readFile(layoutUrl, "utf8");

  assert.match(layout, /Fresh Farm Milk Delivery in Jamshedpur/);
  assert.match(layout, /fresh milk delivery Jamshedpur/);
  assert.match(layout, /milk home delivery Jamshedpur/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.match(layout, /canonical/);
  assert.match(layout, /hero-milk\.png/);
});

test("keeps the landing page focused on milk conversion and trust", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /Fresh farm milk for Jamshedpur homes/);
  assert.match(page, /₹62 per litre/);
  assert.match(page, /919818804419/);
  assert.match(page, /20 years operating/);
  assert.match(page, /500\+ families/);
  assert.match(page, /1,000 L\+/);
  assert.match(page, /Why people believe it/);
  assert.match(page, /Bone-supporting calcium/);
  assert.match(page, /Protein for daily strength/);
  assert.match(page, /Glass bottle/);
  assert.doesNotMatch(page, /Comparison metrics/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /LocalBusiness/);
  assert.match(page, /Product/);
  assert.doesNotMatch(page, /login|password|database|checkout|cart/i);
});

test("styles visual proof sections responsively", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /\.proof-section/);
  assert.match(styles, /\.proof-bars/);
  assert.match(styles, /\.image-belief-section/);
  assert.match(styles, /\.story-photo-section/);
  assert.match(styles, /\.quick-health-grid/);
  assert.match(styles, /@media \(max-width: 980px\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
});
