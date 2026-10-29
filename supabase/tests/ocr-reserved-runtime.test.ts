import { expect, test } from "bun:test";

test("reserved OCR handler preserves per-unit state through retry and interrupted final persistence",async()=>{
  const runner=new URL("./fixtures/ocr-reserved-runtime-runner.ts",import.meta.url).pathname;
  const child=Bun.spawn([process.execPath,runner],{stdout:"pipe",stderr:"pipe"});
  const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if(code!==0)throw new Error(`reserved runtime failed: ${out}\n${err}`);
  expect(out).toContain("ocr_reserved_runtime_passed");
},30000);
