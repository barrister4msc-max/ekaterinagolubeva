import { expect,test } from "bun:test";
test("actual Challenge execution state gates final generation and preserves admission errors/privacy",async()=>{
  const child=Bun.spawn([process.execPath,new URL("./fixtures/challenge-execution-runner.ts",import.meta.url).pathname],{stdout:"pipe",stderr:"pipe"});
  const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  if(code!==0)throw Error(`challenge integration failed: ${out}\n${err}`);
  expect(out).toContain("challenge_execution_integration_passed");
});
