#!/usr/bin/env python3
import argparse,json,os
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument("--manifest",required=True);p.add_argument("--output",required=True);a=p.parse_args()
 manifest=json.loads(Path(a.manifest).read_text()); groups=[x["source_group_id"] for x in manifest["candidates"] if "source_group_id" in x]
 if not groups: raise SystemExit("manifest candidates require source_group_id")
 import psycopg
 with psycopg.connect(os.environ["DATABASE_URL"]) as c, c.cursor() as cur:
  cur.execute("select * from public.kati_legacy_legal_source_content_rows(%s)",(groups,))
  cols=[x.name for x in cur.description]; rows=[dict(zip(cols,x)) for x in cur.fetchall()]
 report={"read_only":True,"substantive_use_allowed":False,"manifest_groups":len(groups),"rows":rows}
 Path(a.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
if __name__=="__main__": main()
