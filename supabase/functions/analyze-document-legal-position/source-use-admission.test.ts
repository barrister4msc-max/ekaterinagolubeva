import { assertEquals } from "jsr:@std/assert";
import { applyRuntimeSourceAdmission } from "./source-use-admission.ts";
Deno.test("unverified internal source remains retrieval-only", () => {
 const [s] = applyRuntimeSourceAdmission([{ metadata:{substantive_use_allowed:false,content_verified:false,temporal_verified:false} } as any]);
 assertEquals((s as any).use_in_generation,false);
 assertEquals((s as any).metadata.source_use_admission.status,"temporal_unresolved");
});
Deno.test("fully verified source is admitted for this run", () => {
 const [s] = applyRuntimeSourceAdmission([{ metadata:{substantive_use_allowed:true,content_verified:true,temporal_verified:true,freshness_status:"current"} } as any]);
 assertEquals((s as any).use_in_generation,true);
});