import { expect,test } from "bun:test";

test("server dispatcher completes the corpus after the UI stops and fails closed on unsafe wakeups",async()=>{
  const path=new URL("./fixtures/ocr-dispatcher-runner.ts",import.meta.url).pathname;
  const child=Bun.spawn([process.execPath,path],{stdout:"pipe",stderr:"pipe"});
  const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if(code!==0)throw new Error(`dispatcher integration failed: ${out}\n${err}`);
  expect(out).toContain("ocr_dispatcher_integration_passed");
},60000);
