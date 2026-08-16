type ZipEntryLike = { dir?: boolean; async: (type: "string") => Promise<string> };
export type XlsxZipLike = { files: Record<string, ZipEntryLike> };

function decodeXml(v: string): string {
  return v.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&amp;/g,"&");
}
function textNodes(xml: string): string {
  const out: string[]=[]; const re=/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m: RegExpExecArray|null;
  while((m=re.exec(xml))!==null) out.push(decodeXml(m[1])); return out.join("");
}
export async function extractXlsxText(zip: XlsxZipLike): Promise<string> {
  const shared:string[]=[]; const ss=zip.files['xl/sharedStrings.xml'];
  if(ss && !ss.dir){ const xml=await ss.async('string'); for(const block of xml.match(/<si\b[\s\S]*?<\/si>/g)??[]) shared.push(textNodes(block)); }
  const sheets=Object.keys(zip.files).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(p)&&!zip.files[p].dir).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const out:string[]=[];
  for(const path of sheets){ const xml=await zip.files[path].async('string'); out.push(`[Лист: ${path.split('/').pop()}]`);
    for(const row of xml.match(/<row\b[\s\S]*?<\/row>/g)??[]){ const cells:string[]=[]; const re=/<c\b([^>]*)>([\s\S]*?)<\/c>/g; let c:RegExpExecArray|null;
      while((c=re.exec(row))!==null){ const attrs=c[1], body=c[2], ref=/\br="([^"]+)"/.exec(attrs)?.[1]??'', type=/\bt="([^"]+)"/.exec(attrs)?.[1]??'';
        let value=''; if(type==='inlineStr') value=textNodes(body); else { const raw=/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]??''; value=type==='s'?(shared[Number(raw)]??''):decodeXml(raw); }
        if(value.trim()) cells.push(ref?`${ref}: ${value.trim()}`:value.trim()); }
      if(cells.length) out.push(cells.join(' | ')); }
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
