import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '@playwright/test';
const root=process.env.VNEXT_BROWSER_FIXTURES;
if(!root || !path.isAbsolute(root))throw Error('actual_owned_rights_snapshots_required');
const oldHome=JSON.parse(fs.readFileSync(path.join(root,'home-before.json'),'utf8'));
const oldDetail=JSON.parse(fs.readFileSync(path.join(root,'detail-before.json'),'utf8'));
const revoked=JSON.parse(fs.readFileSync(path.join(root,'detail.json'),'utf8'));
// Both snapshots must originate from the actual new PG workflow. The control
// changes only which already-captured database response is read by the page.
test('current deep evidence and revoked rights reach full retained article without a new revision',async({page,request},info)=>{
 const original=oldDetail.history[0];expect(original.sourceRights.current).toBe(true);expect(revoked.history[0].sourceRights.current).toBe(false);
 expect(revoked.history[0].revisionId).toBe(original.revisionId);expect(revoked.history[0].content).toEqual(original.content);
 const bridge=`http://127.0.0.1:${process.env.VNEXT_BROWSER_BRIDGE_PORT}`;const headers={'x-test-control':process.env.VNEXT_BROWSER_CONTROL_KEY||''};
 expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'before'}})).ok()).toBeTruthy();await page.goto('/');
 const home=page.getByTestId('vnext-home').filter({visible:true});await expect(home).toHaveCount(1);await expect(home.locator(':scope > section')).toHaveCount(2);
 const card=page.getByTestId('vnext-member').filter({has:page.getByRole('link',{name:'2409',exact:true})});await expect(card).toHaveCount(1);
 const member=oldHome.members.find((m:{symbol:string})=>m.symbol==='2409');expect(member.deepScore.availableWeight).toBeGreaterThan(0);expect(member.deepScore.availableWeight).toBeLessThan(100);
 await expect(card).toContainText(`深度研究：${member.deepScore.confirmedPoints.toFixed(1)} / ${member.deepScore.availableWeight.toFixed(1)}`);
 await expect(card).toContainText('初選：');await expect(page.getByText('研究條件符合',{exact:true})).toHaveCount(0);
 const href=await card.getByRole('link',{name:'2409',exact:true}).getAttribute('href');expect(href).toContain(original.revisionId);
 await page.screenshot({path:info.outputPath('current-deep-evidence.png'),fullPage:true});
 expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'full'}})).ok()).toBeTruthy();await page.goto('/');
 const withdrawn=page.getByTestId('vnext-member').filter({has:page.getByRole('link',{name:'2409',exact:true})});await expect(withdrawn).toContainText('原始來源權利或版本驗證有缺口');await expect(withdrawn).toContainText('深度研究：證據尚不足');
 await expect(withdrawn.getByRole('link',{name:'2409',exact:true})).toHaveAttribute('href',href!);await withdrawn.getByRole('link',{name:'2409',exact:true}).click();
 await expect(page.getByTestId('vnext-detail')).toBeVisible();await expect(page.getByText('原始來源權利目前無法驗證；內容保留為歷史紀錄，不具新進場條件。',{exact:true})).toBeVisible();
 for(const section of Object.values(original.content.sections) as Array<{text:string}>)await expect(page.getByText(section.text,{exact:true})).toBeVisible();
 await expect(page.getByRole('table')).toContainText('0.5 ratio');await expect(page.getByText(`原始發布時間：${original.publishedAt}`,{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:original.publishedAt,exact:true})).toHaveAttribute('href',href!);
 const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));expect(bounds.width).toBeLessThanOrEqual(bounds.viewport+1);
 await page.screenshot({path:info.outputPath('revoked-rights-retained-history.png'),fullPage:true});
});
