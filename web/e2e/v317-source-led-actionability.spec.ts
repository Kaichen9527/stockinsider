import { expect,test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

function contrastRatio(foreground:string, background:string){
  const parse=(value:string)=>{
    const numbers=value.match(/-?[0-9.]+/g)?.slice(0,3).map(Number);if(!numbers||numbers.length!==3)throw new Error(`unparseable_color:${value}`);
    if(value.startsWith('lab(')){
      const [l,a,b]=numbers;const pivot=(component:number)=>component**3>.008856?component**3:(component-16/116)/7.787;
      const fy=(l+16)/116;const xyzD50=[.96422*pivot(fy+a/500),pivot(fy),.82521*pivot(fy-b/200)];
      const [x,y,z]=[.9554734*xyzD50[0]-.0230985*xyzD50[1]+.0632593*xyzD50[2],-.0283697*xyzD50[0]+1.0099955*xyzD50[1]+.0210414*xyzD50[2],.012314*xyzD50[0]-.0205077*xyzD50[1]+1.3303659*xyzD50[2]];
      return [3.2406*x-1.5372*y-.4986*z,-.9689*x+1.8758*y+.0415*z,.0557*x-.204*y+1.057*z].map((channel)=>Math.max(0,Math.min(1,channel)));
    }
    return numbers.map((channel)=>{const normalized=channel/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;});
  };
  const luminance=(value:string)=>{const [r,g,b]=parse(value);return .2126*r+.7152*g+.0722*b;};
  const [a,b]=[luminance(foreground),luminance(background)].sort((left,right)=>right-left);
  return (a+.05)/(b+.05);
}

test('V3.17 keeps a support setup in the waiting lane, makes its snapshot navigable, and keeps CTA contrast readable',async({page})=>{
  const assertNoConsoleErrors=installConsoleErrorGate(page);
  for(const colorScheme of ['light','dark'] as const){
    await page.setViewportSize({width:colorScheme==='light'?1440:320,height:900});
    await page.emulateMedia({colorScheme,reducedMotion:'reduce'});
    await page.goto('/v317-research-fixture');
    if(colorScheme==='dark')await page.evaluate(()=>document.documentElement.classList.add('dark'));
    const waitSection=page.getByRole('heading',{name:'等待條件'}).locator('xpath=ancestor::section');
    const supportCard=waitSection.getByRole('article',{name:/2303/u});
    await expect(supportCard.getByText('等待資料刷新',{exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'新來源待研究'})).toBeVisible();
    const ctas=page.getByRole('link',{name:/查看決策摘要|查看唯讀研究/u});
    expect(await ctas.count()).toBeGreaterThan(0);
    for(let index=0;index<await ctas.count();index+=1){
      const colors=await ctas.nth(index).evaluate((element)=>{const style=getComputedStyle(element);return {color:style.color,backgroundColor:style.backgroundColor};});
      expect(contrastRatio(colors.color,colors.backgroundColor),JSON.stringify({colorScheme,colors})).toBeGreaterThanOrEqual(4.5);
    }
    await supportCard.getByRole('link',{name:'查看決策摘要 →'}).click();
    await expect(page.getByTestId('research-only-detail')).toBeVisible();
    await expect(page.getByTestId('research-only-decision-revision')).toContainText('decision-v3.13');
    await expect(page.getByTestId('research-snapshot-detail')).toContainText('接近支撐');
    await expect(page.getByTestId('research-gate-waterfall')).toContainText('技術面 · 已具備');
  }
  await assertNoConsoleErrors();
});
