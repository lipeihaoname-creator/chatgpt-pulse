import assert from 'node:assert/strict';

// Media-query events and Svelte updates may arrive on later renderer frames.
// Keep the exact count/state assertions, but wait for their observable result.
export async function waitForAccessory(page, expected) {
 await page.waitForFunction(expected=>{
  const elements=document.querySelectorAll('.status-accessory');
  if(expected===null)return elements.length===0;
  return elements.length===1&&elements[0].dataset.accessory===expected.state&&elements[0].dataset.character===expected.character;
 },expected,{timeout:5000});
 const actual=await page.locator('.status-accessory').evaluateAll(elements=>elements.map(el=>({state:el.dataset.accessory,character:el.dataset.character})));
 assert.deepEqual(actual,expected===null?[]:[expected]);
}
