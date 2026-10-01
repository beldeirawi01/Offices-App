import { chromium } from "@playwright/test";
import fs from "fs";
const root="/home/user/beldeirawi01/sauce-demo-playwright-framework/", out="/home/user/Offices-App/portfolio/assets/";
const esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function hl(src){
  const re=/(\/\/.*$|#.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|class|async|await|const|let|readonly|constructor|this|new|for|of|name|on|jobs|steps|uses|run|runs-on)\b/gm;
  return src.split("\n").map(l=>{ let o="",i=0,m; re.lastIndex=0;
    while((m=re.exec(l))){ o+=esc(l.slice(i,m.index)); const c=m[1]?"c":m[2]?"s":"k"; o+=`<span class=${c}>${esc(m[0])}</span>`; i=re.lastIndex; }
    return o+esc(l.slice(i)); }).join("\n");
}
const shots=[
 ["saucedemo-page-object","pages/InventoryPage.ts","pages/InventoryPage.ts",[1,27]],
 ["saucedemo-spec","tests/inventory.spec.ts","tests/inventory.spec.ts",[8,34]],
 ["saucedemo-ci",".github/workflows/playwright.yml",".github/workflows/playwright.yml",[11,37]],
 ["saucedemo-test-data","test-data/CheckoutData.ts","test-data/CheckoutData.ts",[1,27]],
];
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const p=await b.newPage({viewport:{width:1100,height:600},deviceScaleFactor:2});
for(const [name,title,f,range] of shots){
  let lines=fs.readFileSync(root+f,"utf8").trimEnd().split("\n"); if(range) lines=lines.slice(range[0]-1,range[1]);
  const ind=Math.min(...lines.filter(l=>l.trim()).map(l=>l.match(/^ */)[0].length)); lines=lines.map(l=>l.slice(ind));
  const html=`<style>body{margin:0;padding:36px;background:linear-gradient(135deg,#1e293b,#0f172a);font-family:ui-monospace,Menlo,Consolas,monospace}
  .w{background:#0d1117;border-radius:12px;box-shadow:0 20px 50px #0008;overflow:hidden;width:1000px;height:625px}.bar{background:#161b22;height:44px;padding:0 16px;box-sizing:border-box;display:flex;gap:8px;align-items:center;color:#8b949e;font-size:13px}
  .d{width:12px;height:12px;border-radius:50%}pre{margin:0;padding:20px 24px;box-sizing:border-box;color:#e6edf3;font-size:14px;line-height:20px;tab-size:4;white-space:pre;overflow:hidden}.k{color:#ff7b72}.s{color:#a5d6ff}.c{color:#8b949e}</style>
  <div class=w><div class=bar><i class=d style=background:#ff5f56></i><i class=d style=background:#ffbd2e></i><i class=d style=background:#27c93f></i><span style="margin-left:10px">${title}</span></div><pre>${hl(lines.join("\n"))}</pre></div>`;
  await p.setContent(html); await p.locator(".w").screenshot({path:out+name+".png"}); console.log(name);
}
await b.close();
