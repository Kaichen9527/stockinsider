import { test, expect } from '@playwright/test';
// Actual persisted revisions from an isolated PostgreSQL lifecycle, served by
// read-only transport. This is not live news/model or production publication.
test('substantive source correction selects the new exact revision and retains the old page', async ({page,request},info)=>{
 const bridge=`http://127.0.0.1:${process.env.VNEXT_BROWSER_BRIDGE_PORT}`;
 const headers={'x-test-control':process.env.VNEXT_BROWSER_CONTROL_KEY || ''};
 const before=await request.post(bridge+'/__fixture/control',{headers,data:{mode:'before'}});expect(before.ok()).toBeTruthy();
 await page.goto('/');
 const link=page.getByTestId('vnext-member').getByRole('link',{name:'2409',exact:true});
 const oldHref=await link.getAttribute('href');expect(oldHref).toContain('vnextRevision=');
 await link.click();await expect(page.getByText('Synthetic isolated research conclusion',{exact:true})).toBeVisible();
 const after=await request.post(bridge+'/__fixture/control',{headers,data:{mode:'full'}});expect(after.ok()).toBeTruthy();
 await page.goto('/');const updated=page.getByTestId('vnext-member').getByRole('link',{name:'2409',exact:true});
 expect(await updated.getAttribute('href')).not.toBe(oldHref);await updated.click();
 await expect(page.getByText('Synthetic revised source research conclusion',{exact:true})).toBeVisible();
 await expect(page.getByTestId('vnext-detail')).toContainText('180');
 await page.screenshot({path:info.outputPath('revised-detail.png'),fullPage:true});
 await page.goto(oldHref!);
 await expect(page.getByText('Synthetic isolated research conclusion',{exact:true})).toBeVisible();
 await expect(page.getByText('Synthetic revised source research conclusion',{exact:true})).toHaveCount(0);
});
