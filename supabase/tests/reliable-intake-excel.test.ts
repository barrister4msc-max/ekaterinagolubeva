import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { expandSelectedDocumentFiles, expandZipPackage, isSupportedDocumentName } from "../../src/lib/document-package-files";
import { stageDocuments, STAGING_CONCURRENCY, STAGING_MAX_ATTEMPTS } from "../../src/lib/upload-lifecycle";
import { extractXlsxText } from "../functions/_shared/xlsx-text";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
describe('reliable N-file intake',()=>{
  test('10 selected including XLSX remain 10',async()=>{ const files=[...Array.from({length:9},(_,i)=>new File([String(i)],`d${i}.docx`)),new File(['x'],'свод по контрагентам.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})]; const r=await expandSelectedDocumentFiles(files); expect(r.files).toHaveLength(10); expect(r.files.at(-1)?.name).toBe('свод по контрагентам.xlsx'); });
  test('retries transient staging and accounts all files',async()=>{ const names=Array.from({length:10},(_,i)=>`f${i}`); const attempts=new Map<string,number>(); let active=0,peak=0; const r=await stageDocuments(names,async n=>{active++;peak=Math.max(peak,active);try{await sleep(2);const a=(attempts.get(n)??0)+1;attempts.set(n,a);if((n==='f3'||n==='f9')&&a===1)throw new Error('transient');return{id:n,fileName:n};}finally{active--; }},{getName:n=>n}); expect(r.staged).toHaveLength(10); expect(r.failed).toEqual([]); expect(peak).toBeLessThanOrEqual(STAGING_CONCURRENCY); expect(STAGING_MAX_ATTEMPTS).toBe(3); });
  test('permanent failure is explicit',async()=>{const r=await stageDocuments(['a','bad','c'],async n=>{if(n==='bad')throw new Error('bad');return{id:n,fileName:n};},{getName:n=>n,maxAttempts:2});expect(r.staged.length+r.failed.length).toBe(3);expect(r.failed).toEqual(['bad']);});
});
describe('Excel',()=>{
  test('xls/xlsx accepted in package',()=>{expect(isSupportedDocumentName('a.xls')).toBe(true);expect(isSupportedDocumentName('a.xlsx')).toBe(true);});
  test('xlsx inside zip is not skipped',async()=>{const z=new JSZip();z.file('x/a.xlsx','x');z.file('x/b.docx','b');const blob=await z.generateAsync({type:'blob'});const r=await expandZipPackage(blob,'z.zip');expect(r.files.map(f=>f.name).sort()).toEqual(['a.xlsx','b.docx']);});
  test('xlsx XML text extracts shared strings/numbers',async()=>{const z=new JSZip();z.file('xl/sharedStrings.xml','<sst><si><t>ООО Ромашка</t></si><si><t>7701234567</t></si></sst>');z.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>125000</v></c></row></sheetData></worksheet>');const t=await extractXlsxText(z as any);expect(t).toContain('ООО Ромашка');expect(t).toContain('7701234567');expect(t).toContain('125000');});
});
