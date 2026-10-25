// Decoration follows confirmed status; it never invents progress or token counts.
export const themes = {
 mint:{name:'薄荷抹茶',bg:'#1e3328',ink:'#ddf4e4',accent:'#a4ddb8',muted:'#a4bdac'},
 sakura:{name:'樱花奶霜',bg:'#35252e',ink:'#fae0ed',accent:'#f2a8c7',muted:'#c6a2b5'},
 moon:{name:'月光藤紫',bg:'#262236',ink:'#f1e6ff',accent:'#d4b8f0',muted:'#b5a5cf'},
 ice:{name:'冰川蓝',bg:'#202f3c',ink:'#e1efff',accent:'#a4d3f8',muted:'#9fb8cb'},
 tea:{name:'奶茶琥珀',bg:'#352d24',ink:'#f5e8d3',accent:'#e5c38b',muted:'#bfb09a'},
 spellbook:{name:'魔法书蓝',bg:'#242b42',ink:'#f5efdf',accent:'#b5c5ff',muted:'#adb5d2'}
};
export const characters={mai:{name:'麻衣',description:'从容陪伴，偶尔轻轻吐槽'},roxy:{name:'洛琪希',description:'认真授课，也陪你慢慢练习'}};
export function characterName(key){return characters[key]?.name||'Pulse';}
export const expressionNames=['平静','专注','思考','说话','忙碌','等你','完成','疑惑','担心'];
export function expressionFor(key){return ({processing:1,loading:1,reasoning:2,responding:3,tool:4,waiting_user:5,waiting_approval:5,completed:6,quiet:7,unknown:7,retrying:7,unavailable:8,incomplete:8,disconnected:8})[key]??0;}
export function shortStatus(key,fallback){return ({reasoning:'推理中',responding:'输出中',tool:'工具中',waiting_user:'等你回答',waiting_approval:'等你批准',quiet:'状态待确认',completed:'已完成',aborted:'已中止',paused:'已暂停',waiting:'未收到信号',unknown:'等待信号',disconnected:'监测未更新'})[key]||fallback;}
export function themeStyle(key){const t=themes[key]||themes.mint;return `--pet-bg:${t.bg};--pet-ink:${t.ink};--pet-accent:${t.accent};--pet-muted:${t.muted};`;}
export function bubbleVisible(settings,work,card){return settings.bubble_mode!=='working'||!!card||!['paused','waiting','completed','aborted'].includes(work.key);}
