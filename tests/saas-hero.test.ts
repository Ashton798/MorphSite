import assert from "node:assert/strict";
import { test } from "node:test";
import { demoBrandSpec, replaceWebsiteTitle } from "../lib/brand-spec";
import { DEFAULT_SAAS_HERO, resolveSaasHeroContent, SAAS_PROOF_BRANDS } from "../lib/saas-hero-content";

test("empty Website template uses the exact APEX sample copy without creating BrandSpec", () => {
  assert.deepEqual(resolveSaasHeroContent(null), DEFAULT_SAAS_HERO);
  assert.equal(DEFAULT_SAAS_HERO.title, "Accelerate Your\nRevenue Growth Now");
  assert.equal(DEFAULT_SAAS_HERO.subtitle, "Drive your funnel forward with clever workflows, analytics, and seamless lead management.");
  assert.deepEqual(SAAS_PROOF_BRANDS, ["Vortex", "Nimbus", "Prysma", "Cirrus", "Kynder", "Halcyn"]);
});

test("SaaS Hero consumes real BrandSpec fields and leaves the source document untouched", () => {
  const original = structuredClone(demoBrandSpec);
  const content = resolveSaasHeroContent(demoBrandSpec);
  assert.equal(content.logo, demoBrandSpec.assets.logo);
  assert.equal(content.title, demoBrandSpec.website.title);
  assert.equal(content.subtitle, demoBrandSpec.website.subtitle);
  assert.equal(content.primaryLabel, demoBrandSpec.website.sections[0].cta);
  assert.deepEqual(demoBrandSpec, original);
  const updated = replaceWebsiteTitle(demoBrandSpec, "Fresh title from AI or Demo");
  assert.equal(resolveSaasHeroContent(updated).title, "Fresh title from AI or Demo");
});

test("template-specific copy overrides are presentation-only and don't add schema fields", () => {
  const content = resolveSaasHeroContent(demoBrandSpec, undefined, { secondaryLabel: "Book a call" });
  assert.equal(content.secondaryLabel, "Book a call");
  assert.equal(content.title, demoBrandSpec.website.title);
  assert.ok(!("secondaryLabel" in demoBrandSpec));
});
