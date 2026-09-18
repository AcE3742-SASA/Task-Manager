// Run against a local Vite server. All auth/Firestore calls use synthetic data.
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import assert from 'node:assert/strict'

const base = process.env.THEME_QA_URL || 'http://127.0.0.1:5173'
const engine = process.env.THEME_QA_BROWSER || 'chromium'
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', serviceWorkers: 'block' })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR',e.message) })
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

const firestore = `
export class Timestamp { constructor(d){this.d = new Date(d)} toDate(){return this.d} static fromDate(d){return new Timestamp(d)} static now(){return new Timestamp(new Date())} }
const qa=window.__qa ??= {};
let uid='qa-user';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const due=(offset)=>new Timestamp(new Date(new Date(today+'T23:59:00+09:00').getTime()+offset*86400000));
const subjects=[{id:'physics',name:'일반물리학 I',short:'일물',icon:'atom',color:'#C7D3C0',slots:[{day:1,period:1},{day:3,period:4}]},{id:'ai',name:'인공지능',short:'AI',icon:'code',color:'#F1BDCA',slots:[{day:1,period:8},{day:2,period:2}]},{id:'math',name:'미적분학 I',short:'미적분',icon:'ruler',color:'#B2D8E9',slots:[{day:2,period:3}]}];
const tasks=[['t1','구심력 실험 보고서','physics',0],['t2','A* Search 탐색 과제 — 긴 제목 확인','ai',0],['t3','미적분 연습문제','math',1],['t4','발표 자료 정리','ai',3],['t5','지난 과제 완료','physics',-1]].map(([id,title,subjectId,days],i)=>({id,title,subjectId,due:due(days),kind:'과제',repeat:'none',note:'테마 검증용 예시 데이터',done:i===4,createdAt:due(-5),doneAt:i===4?due(-1):null,focusDate:i===0?today:null}));
let store=JSON.parse(localStorage.getItem('qa-db')||'null')||{'qa-user':{theme:'light',themeStyle:'classic'},'qa-user-2':{theme:'dark',themeStyle:'neumorphism'}};
const listeners=new Set();
export const doc=(_db,...p)=>p.join('/'); export const collection=doc;
function snap(path,pending=false){const parts=path.split('/');const user=parts[1];const kind=parts[2];if(kind==='settings')return {exists:()=>true,data:()=>store[user]||{},metadata:{fromCache:false,hasPendingWrites:pending}};const data=qa.empty?[]:kind==='tasks'?tasks:kind==='subjects'?subjects:[];return {docs:data.map(d=>({id:d.id,data:()=>d,ref:path+'/'+d.id})),empty:!data.length,size:data.length};}
function emit(pending=false){for(const l of listeners)l.cb(snap(l.path,pending));}
export function onSnapshot(path,...args){const cb=args.find(x=>typeof x==='function');const l={path,cb};listeners.add(l);queueMicrotask(()=>{if(listeners.has(l))cb(snap(path))});return ()=>listeners.delete(l);}
export async function setDoc(path,patch){const user=path.split('/')[1];const before=store[user]||{};store[user]={...before,...patch};emit(true);await new Promise(r=>setTimeout(r,80));if(qa.holdWrites)await new Promise(r=>(qa.pending??=[]).push(r));if(qa.failNext){qa.failNext=false;store[user]=before;emit(false);throw Error('QA rejected write');}localStorage.setItem('qa-db',JSON.stringify(store));emit(false);}
qa.setSettings=(patch,user='qa-user')=>{store[user]={...(store[user]||{}),...patch};localStorage.setItem('qa-db',JSON.stringify(store));emit(false)};
qa.setEmpty=v=>{qa.empty=v;emit()};qa.removeFirst=()=>{tasks.shift();emit()};qa.addMany=()=>{tasks.push(...Array.from({length:50},(_,i)=>({...tasks[2],id:'long-'+i,focusDate:null})));emit()};
export const getDoc=async p=>snap(p);export const getDocs=getDoc;export const addDoc=async()=>({id:'qa-added'});export const deleteDoc=async()=>{};export const updateDoc=setDoc;export const serverTimestamp=()=>Timestamp.now();export const runTransaction=async()=>{};export const writeBatch=()=>({set(){},delete(){},commit:async()=>{}});
`

await page.route('**/*', async route => {
  const url = route.request().url()
  if (!url.startsWith(base)) return route.abort()
  if (url.includes('/src/lib/firebase.ts')) return route.fulfill({contentType:'application/javascript',body:'export const db={};export const auth={};export const isConfigured=true;export const googleProvider={};'})
  if (url.includes('/node_modules/.vite/deps/firebase_firestore.js')) return route.fulfill({contentType:'application/javascript',body:firestore})
  if (url.includes('/src/lib/useAuth.ts')) {
    const text=await (await route.fetch()).text();const react=text.match(/from "([^"]*react[^\"]*)"/)[1]
    return route.fulfill({contentType:'application/javascript',body:`import React from '${react}';const {useState,useEffect}=React;export function useAuth(){const [uid,setUid]=useState('qa-user');useEffect(()=>{window.__qa.auth=setUid},[]);return {user:uid?{uid,email:'theme-preview@example.test',displayName:'테마 미리보기',photoURL:null}:null,loading:false,error:null}}`})
  }
  return route.continue()
})

await page.goto(base)
await page.waitForSelector('.task').catch(async e=>{console.log(errors,await page.content());throw e})
await page.evaluate(()=>document.fonts.ready)
console.log('Fixture loaded; actual app components, mocked auth/Firestore, external network blocked.')

async function go(path){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'))},path);await page.waitForTimeout(35)}
async function theme(style,mode){await page.evaluate(({style,mode})=>window.__qa.setSettings({themeStyle:style,theme:mode}),{style,mode});await page.waitForFunction(({style,mode})=>document.documentElement.dataset.themeStyle===style&&document.documentElement.dataset.theme===mode,{style,mode});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(220)}



try {
  await theme('glassmorphism', 'light')
  await page.waitForSelector('[data-liquid-glass] feImage[href^="data:"]', { state: 'attached' })
  assert.equal(await page.locator('.task .txt').first().evaluate(e => getComputedStyle(e).filter), 'none')
  await page.locator('.task .hit').first().click()
  await page.waitForURL('**/task/t1')
  await page.waitForSelector('input.inp')
  assert.equal(await page.locator('.task [data-liquid-glass]').count(), 0)
  await go('/')
  await page.evaluate(() => window.__qa.removeFirst())
  await page.waitForTimeout(350)
  assert(await page.locator('.task .liquid-surface:has([data-liquid-glass])').first().evaluate(e => {
    const app = e.closest('.app'), box = e.getBoundingClientRect(), scene = app.getBoundingClientRect()
    const offset = getComputedStyle(e).getPropertyValue('--glass-scene-position').match(/-?[\d.]+/g).map(Number)
    return Math.abs(offset[1] - (scene.top + app.clientTop - box.top)) < 1
  }), 'copied backdrop must follow card removal without scrolling')
  await page.evaluate(() => window.__qa.addMany())
  await page.waitForTimeout(350)
  assert.equal(await page.locator('.task').count(), 54)
  assert(await page.locator('[data-liquid-glass]').count() < 15, 'offscreen cards must not allocate lenses')
  await page.locator('.screenbody').evaluate(e => e.scrollTop = 1300)
  await page.waitForTimeout(350)
  assert(await page.locator('[data-liquid-glass]').count() < 15, 'scrolling must unmount old lenses')
  const aligned = await page.locator('.task .liquid-surface:has([data-liquid-glass])').first().evaluate(e => {
    const scene = e.closest('.app'), rect = e.getBoundingClientRect(), app = scene.getBoundingClientRect()
    const offset = getComputedStyle(e).getPropertyValue('--glass-scene-position').match(/-?[\d.]+/g).map(Number)
    return Math.abs(offset[0] - (app.left + scene.clientLeft - rect.left)) < 1 && Math.abs(offset[1] - (app.top + scene.clientTop - rect.top)) < 1
  })
  assert(aligned, 'copied backdrop must follow scroll position')
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
    await page.waitForFunction(() => !document.querySelector('[data-liquid-glass]'))
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()), '#ffffff')
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })
    await page.waitForSelector('[data-liquid-glass]', { state: 'attached' })
  }
  await theme('classic', 'light')
  assert.equal(await page.locator('.liquid-surface').count(), 0)
  assert.deepEqual(errors, [])
  console.log(`${engine}: PASS — filter loading, crisp content, task opening, offscreen cleanup, scroll alignment, theme cleanup${engine === 'chromium' ? ', reduced transparency' : ''}`)
} finally {
  await browser.close()
}
